/*!
	APNG Parser ver 0.8.1 beta
	Copyright (c) 2017, 2024 Epistemex.com
	License: CC BY-NC-SA 4.0
*/

'use strict';

/**
 * APNG holds objects to parse, animate and [build] animated PNG files.
 * @namespace APNG
 */
const APNG = {};

/**
 * Parses an Animated PNG (APNG) into raw frames (images) which can be
 * used for "manual" animation, frame extraction, analyze and optimization
 * purposes.
 *
 * The parsing is asynchronous and require a callback function. Callback
 * for errors is optional.
 *
 * @param {ArrayBuffer|TypedArray|String|Blob|File} input - URL to a APNG file, or an Blob/File object, or a ArrayBuffer/TypedArray holding a APNG file.
 * @param {Function} callback - callback function invoked when all parsing and conversion is done. `this` represents the current instance.
 * @param {Function} [onerror] - error callback.
 * @constructor
 */
APNG.Parser = function(input, callback, onerror) {

  const me = this;
  let table;
  let fileReader;
  let mimeType = { type: 'image/png' };

  // bind callback for "this"
  callback = callback.bind(this);

  /**
   * Width of animation in pixels
   * @type {number}
   */
  this.width = 0;

  /**
   * Height of animation in pixels
   * @type {number}
   */
  this.height = 0;

  /**
   * Number of iterations (loops) defined in animation header chunk.
   * @type {number}
   */
  this.iterations = 0;

  /**
   * Duration of animation in milliseconds.
   * @type {number}
   */
  this.duration = 0;

  /**
   * Holds Image object (PNG) representing each raw frame.
   * @type {Array}
   */
  this.frames = [];

  /**
   * Information for how a frame should be rendered. The frame has an
   * offset and size that needs to be considered, as well as dispose
   * method and blend operation.
   *
   * See the [official documentation]{@link https://developer.mozilla.org/en-US/docs/Mozilla/Tech/APNG} for the various definitions.
   *
   * @type {Array}
   */
  this.frameInfo = [];

  /**
   * Check if the source is actually a animated PNG.
   * @type {boolean}
   */
  this.isAPNG = false;

  /*-----------------------------------------------------------------------------------------------------------------*\

      VERIFY AND CONVERT (IF NEEDED) INPUT TYPE

  \*-----------------------------------------------------------------------------------------------------------------*/

  if ( input instanceof Blob || input instanceof File ) {
    fileReader = new FileReader();
    fileReader.onload = function() {
      parseBuffer(this.result);
    };
    fileReader.onerror = onerror || null;
    fileReader.readAsArrayBuffer(input);
  }
  else if ( typeof input === 'string' ) {
    fetch(input).then(function(resp) {return resp.arrayBuffer();}).then(parseBuffer);
  }
  else if ( ArrayBuffer.isView(input) ) {
    parseBuffer(input.buffer);
  }
  else if ( input instanceof ArrayBuffer ) {
    parseBuffer(input);
  }
  else throw 'Unknown input type';

  /*-----------------------------------------------------------------------------------------------------------------*\

      PARSER

  \*-----------------------------------------------------------------------------------------------------------------*/

  function parseBuffer(buffer) {

    const view = new DataView(buffer);
    const chunks = [];
    let pos = 0;
    let frames = 0;

    // validate PNG header
    if ( getU32() !== 0x89504E47 || getU32() !== 0x0D0A1A0A ) {
      throw new Error('Not a (A)PNG file.');
    }

    // Get full size of image
    me.width = view.getUint32(16);
    me.height = view.getUint32(20);

    // Parse chunks
    while( pos < buffer.byteLength ) {
      const chunk = {
        size: getU32(),
        name: getFourCC(),
        pos : pos
      };

      chunks.push(chunk);

      if ( chunk.name === 'acTL' ) me.isAPNG = true;
      pos += chunk.size + 4;                                            // skip to next chunk skipping CRC32
    }

    /*---------------------------------------------------------------------------------------------------------------*\

        IF APNG, PARSE CHUNKS AND DATA

    \*---------------------------------------------------------------------------------------------------------------*/

    if ( me.isAPNG ) {
      let parts = null;                                   // image data parts (IDAT, fdAT) for each file
      let fcCount = 0;                                    // check fcTL chunk count, compare with frames
      let seqLast = 0, seqNo, errOutOfOrder = false;      // detect out-of-order APNGs
      let fctlBeforeIDAT = false;                         // for IDAT chunk, if true IDAT is part of anim.
      let duration = 0;                                   // track total duration
      const files = [];                                   // data separated for each PNG file
      const header = [];                                  // common headers for each file (will have modified IDAT)
      const headerChunks = [                              // chunks we want to bring over to each individual PNG file
        'IHDR', 'PLTE', 'gAMA', 'pHYs', 'tRNS', 'iCCP', 'sRGB', 'sBIT', 'sPLT'
      ];

      // Iterate over each chunk to extract animation data
      chunks.forEach(function(chunk) {

        // build common header (size for header updated in blob)
        if ( headerChunks.indexOf(chunk.name) > -1 ) {
          header.push(chunk);
        }

        // Should only occur once, holds number of frames and iterations
        else if ( chunk.name === 'acTL' ) {
          pos = chunk.pos;
          frames = getU32();
          me.iterations = getU32();
        }

        // Frame control chunk hold offset, region size and timing data
        else if ( chunk.name === 'fcTL' ) {
          fcCount++;
          if ( parts ) files.push(parts);                                       // push previous parts if any
          parts = [];                                                           // initialize for new parts
          fctlBeforeIDAT = true;
          pos = chunk.pos;                                                      // skip sequence no.

          seqNo = getU32();

          if ( seqNo >= seqLast ) {
            seqLast = seqNo;
          }
          else {
            errOutOfOrder = true;
          }

          me.frameInfo.push({
            width  : getU32(),
            height : getU32(),
            x      : getU32(),
            y      : getU32(),
            delay  : getU16() / (getU16() || 1) * 1000,                         // convert to ms.
            dispose: getU8(),
            blend  : getU8()
          });

          // correct the time if denominator === 0, as per specs
          if ( view.getUint16(pos - 4) === 0 )
            me.frameInfo[ me.frameInfo.length - 1 ].delay = 10;

          // add to duration
          duration += me.frameInfo[ me.frameInfo.length - 1 ].delay;
        }

        // A regular IDAT, if preceded by a fcTL chunk it is considered part of the animation
        else if ( chunk.name === 'IDAT' ) {
          if ( fctlBeforeIDAT ) {
            parts.push(new Uint8Array(view.buffer, chunk.pos, chunk.size));
          }
        }

        // Image data for frame, holds sequence number (ignored) followed by regular IDAT image data
        else if ( chunk.name === 'fdAT' ) {
          seqNo = view.getUint32(chunk.pos);
          if ( seqNo >= seqLast )
            seqLast = seqNo;
          else
            errOutOfOrder = true;

          parts.push(new Uint8Array(view.buffer, chunk.pos + 4, chunk.size - 4));
        }
      });

      // add final part
      if ( parts ) files.push(parts);

      // publish duration
      me.duration = duration;

      // if first frame's dispose method is 2 then use 1, as per specs
      //if (me.frameInfo[0].dispose === 2); // DISCUSS as the goal is not so much to validate APNGs but parsing
      //  me.frameInfo[0].dispose = 1;      // them as-is, we should assume this is correct from producer (?).

      if ( fcCount !== frames || errOutOfOrder ) // todo: improve all error handling (target: beta)
        console.log('Warning: The APNG contains errors and may not play back correctly.');

      /*-------------------------------------------------------------------------------------------------------------*\

          BUILD BLOBS REPRESENTING EACH FRAME AS A (PRODUCED) PNG FILE

      \*-------------------------------------------------------------------------------------------------------------*/

      // create a CRC32 LUT
      table = buildCRC();

      files.forEach(function(file, index) {

        // PNG header
        const info = me.frameInfo[ index ];
        let list = [ new Uint32Array([ 0x474E5089, 0xA1A0A0D ]) ];
        let blob, url, img;

        // copy and modify existing chunks
        if ( chunks[ 0 ].name !== 'IHDR' )
          throw 'Error in PNG. IHDR not in correct position.';

        // Copy each base chunks into new blob
        header.forEach(function(chunk) {

          let dv, ihdr;

          // We need to reflect region size in the IHDR and recalculate CRC32
          if ( chunk.name === 'IHDR' ) {
            dv = new DataView(view.buffer, chunk.pos, chunk.size);
            dv.setUint32(0, info.width);
            dv.setUint32(4, info.height);

            ihdr = makeChunk('IHDR', new Uint8Array(view.buffer, chunk.pos, chunk.size));
            list.push(ihdr);
          }

          // other chunks are copied as-is
          else {
            list.push(new Uint8Array(view.buffer, chunk.pos - 8, chunk.size + 12));
          }
        });

        // Image data chunks (can be multiple per file) data added, converted to IDAT with new CRC32
        // Can also be merged into a single chunk but need more temp memory and is slower due to the additional copy process.
        file.forEach(function(part) {
          list.push(makeChunk('IDAT', part));
        });

        // push final IEND chunk
        list.push(new Uint32Array([ 0, 0x444e4549, 0x826042ae ]));

        /*-----------------------------------------------------------------------------------------------------------*\

            CREATE IMAGE OBJECTS FOR EACH FRAME BLOB

        \*-----------------------------------------------------------------------------------------------------------*/

        blob = new Blob(list, mimeType);                                // merge part list into a single blob
        list = null;                                                    // lets hope GC can kick in due to async loading below
        url = URL.createObjectURL(blob);                                // temp. URL for image

        img = new Image;
        img.onload = loadHandler;
        img.onerror = errorHandler;
        img.src = url;

        me.frames.push(img);                                            // Add final image to frame Array

        function loadHandler() {
          URL.revokeObjectURL(this.src);
          if ( index === frames - 1 ) callback();                         // DONE!
        }

        function errorHandler() {
          if ( onerror ) {
            onerror('Internal error producing PNG.');
          }
          else if ( index === frames - 1 )
            callback();
        }
      });

    }
    else {

      /*-----------------------------------------------------------------------------------------------------------*\

          IT'S A REGULAR PNG, STORE IT AS A SINGLE FRAME

      \*-----------------------------------------------------------------------------------------------------------*/

      me.frames.push(new Image);
      me.frames[ 0 ].onload = function() {
        URL.revokeObjectURL(this.src);
        me.frameInfo.push({
          x      : 0,
          y      : 0,
          width  : me.width,
          height : me.height,
          delay  : -1,
          dispose: 1,
          blend  : 0
        });
        callback();
      };
      me.frames[ 0 ].src = URL.createObjectURL(new Blob([ buffer ], mimeType));
    }

    /*-----------------------------------------------------------------------------------------------------------*\

        DATAVIEW HELPERS

    \*-----------------------------------------------------------------------------------------------------------*/

    function getU8() {
      return view.getUint8(pos++);
    }

    function getU16() {
      const v = view.getUint16(pos);
      pos += 2;
      return v;
    }

    function getU32() {
      const v = view.getUint32(pos);
      pos += 4;
      return v;
    }

    function getFourCC() {
      const v = getU32();
      const c = String.fromCharCode;
      return c(v >>> 24) + c(v >> 16 & 0xff) + c(v >> 8 & 0xff) + c(v & 0xff);
    }
  }

  // Build a CRC32 LUT-table for makeChunk()
  function buildCRC() {
    const table = new Uint32Array(256);
    let i = 0, j, crc;

    while( i < 256 ) {
      crc = i >>> 0;
      for(j = 0; j < 8; j++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      table[ i++ ] = crc;
    }
    return table;
  }

  /**
   * Produces a PNG chunk from name and data, including calculated CRC32
   * checksum. Can be added directly to a PNG file.
   *
   * @param {String} name - four ASCII letters (Four-CC) name for chunk.
   * @param {Uint8Array} data - data to wrap into chunk
   * @returns {Uint8Array}
   * @private
   */
  function makeChunk(name, data) {

    const chunk = new Uint8Array(data.length + 12);
    const dv = new DataView(chunk.buffer);

    dv.setUint32(0, data.length);
    dv.setUint32(4, makeFourCC(name));
    chunk.set(data, 8);
    dv.setUint32(chunk.length - 4, calcCRC(chunk));

    function makeFourCC(n) {
      const c = n.charCodeAt.bind(n);
      return c(0) << 24 | (c(1) & 0xff) << 16 | (c(2) & 0xff) << 8 | c(3) & 0xff;
    }

    function calcCRC(buffer) {
      const len = buffer.length - 4;
      let crc = (-1 >>> 0);
      let i = 4;

      while( i < len ) crc = (crc >>> 8) ^ table[ (crc ^ buffer[ i++ ]) & 0xff ];
      return crc ^ -1;
    }

    return chunk;
  }
};
