/*!
	APNG Parser ver 0.1.1 alpha
	Copyright (c) 2017 Epistemex
	www.epistemex.com
	License: CC BY-NC-SA 4.0
*/

"use strict";

/**
 * Parses a Animated PNG (APNG) into raw frames (images) which can be
 * used for "manual" animation, frame extraction, analyze and optimization
 * purposes.
 *
 * @param {ArrayBuffer|String|Blob|File} input - URL to a APNG file, or a Blob/File object, or a pre-filled ArrayBuffer holding a APNG file.
 * @param {Function} callback - callback function invoked when all parsing and conversion is done. The call is asynchronous.
 * @param {Function} [onerror] - error callback.
 * @constructor
 */
function APNGParser(input, callback, onerror) {

  var me = this, table, fr;

  if (callback) callback = callback.bind(me);
  else callback = function() {console.log("No callback provided.")};

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

  /*--------------------------------------------------------------------

      VERIFY AND CONVERT (IF NEEDED) INPUT TYPE

  --------------------------------------------------------------------*/

  if (input instanceof Blob || input instanceof File) {
    fr = new FileReader();
    fr.onloadend = function() {
      parseBuffer(input);
    };
    fr.readAsArrayBuffer(input)
  }
  else if (typeof input === "string") {
    fetch(input).then(function(resp) {return resp.arrayBuffer()}).then(parseBuffer);
  }
  else if (ArrayBuffer.isView(input)) {
    parseBuffer(input.buffer);
  }
  else if (input instanceof ArrayBuffer) {
    parseBuffer(input);
  }
  else throw "Wrong input type";

  /*--------------------------------------------------------------------

      PARSER

  --------------------------------------------------------------------*/

  function parseBuffer(buffer) {

    var view = new DataView(buffer),
        pos = 0,
        frames = 0,
        chunks = [],
        isAPNG = false;

    // validate PNG header
    if (getU32() !== 0x89504E47 || getU32() !== 0x0D0A1A0A)
      throw "Not a (A)PNG file.";

    // Get full size of image
    me.width = view.getUint32(16);
    me.height = view.getUint32(20);

    // Parse chunks
    while(pos < buffer.byteLength) {
      var chunk = {
        size: getU32(),
        name: getFourCC(),
        pos: pos
      };
      chunks.push(chunk);

      if (chunk.name === "acTL") isAPNG = true;
      pos += chunk.size + 4;                                            // skip to next chunk skipping CRC32
    }

    /*--------------------------------------------------------------------

        IF APNG, PARSE CHUNKS AND DATA

    --------------------------------------------------------------------*/

    if (isAPNG) {

      var parts = null,
          firstFC = false,
          files = [],
          header = [],
          headerChunks = [                                              // chunks we want to bring over to each individual PNG file
            "IHDR", "PLTE", "gAMA", "pHYs", "tRNS", "iCCP", "sRGB", "sBIT", "sPLT"
          ],
          data;

      // Iterate over each chunk to extract animation data
      chunks.forEach(function(chunk) {

        // build common header (size for header updated in blob)
        if (headerChunks.indexOf(chunk.name) > -1) {
          header.push(chunk);
        }

        // Should only occur once, holds number of frames and iterations
        else if (chunk.name === "acTL") {
          pos = chunk.pos;
          frames = getU32();
          me.iterations = getU32();
        }

        // Frame control chunk hold offset, region size and timing data
        else if (chunk.name === "fcTL") {
          if (parts) files.push(parts);
          parts = [];
          firstFC = true;
          pos = chunk.pos + 4;
          me.frameInfo.push({
            width: getU32(),
            height: getU32(),
            x: getU32(),
            y: getU32(),
            delay: getU16() / (getU16() || 1) * 1000,
            dispose: getU8(),
            blend: getU8()
          });

          // correct the time if denominator = 0
          if (view.getUint16(pos - 4) === 0)
            me.frameInfo[me.frameInfo.length - 1].delay = 10;
        }

        // A regular IDAT, if preceeded by a fcTL chunk it is considered part of the animation
        else if (chunk.name === "IDAT") {
          if (firstFC) {                                                // incl. IDAT only if preceded by a fcTL chunk
            data = new Uint8Array(view.buffer, chunk.pos, chunk.size);
            parts.push(data);
          }
        }

        // Image data for frame, holds sequence number (ignored) followed by regular IDAT image data
        else if (chunk.name === "fdAT") {
          data = new Uint8Array(view.buffer, chunk.pos + 4, chunk.size - 4);
          parts.push(data);
        }
      });

      // add final part
      if (parts) files.push(parts);

      // check first frame dispose method
      if (me.frameInfo[0].dispose === 2)
        me.frameInfo[0].dispose = 1;

      // create a CRC32 LUT
      table = buildCRC();

      /*--------------------------------------------------------------------

          BUILD BLOBS REPRESENTING EACH FRAME AS A (PRODUCED) PNG FILE

      --------------------------------------------------------------------*/

      files.forEach(function(file, index) {

        // PNG header
        var list = [new Uint32Array([0x474E5089, 0xA1A0A0D])],
            info = me.frameInfo[index],
            blob, url, img;

        // copy and modify existing chunks
        if (chunks[0].name !== "IHDR")
          throw "Error in PNG. IHDR not in correct position.";

        // Copy each base chunks into new blob
        header.forEach(function(chunk) {

          // We need to reflect region size in the IHDR and recalculate CRC32
          if (chunk.name === "IHDR") {
            var data8 = new Uint8Array(view.buffer, chunk.pos, chunk.size);
            var dv = new DataView(view.buffer, chunk.pos, chunk.size);
            dv.setUint32(0, info.width);
            dv.setUint32(4, info.height);
            var ihdr = makeChunk("IHDR", data8);
            list.push(ihdr);
          }

          // other chunks are copied as-is
          else {
            list.push(new Uint8Array(view.buffer, chunk.pos - 8, chunk.size + 12));
          }
        });

        // Image data chunks data added, converted to IDAT and with new CRC32
        file.forEach(function(part) {
          list.push(makeChunk("IDAT", part));
        });

        // push final IEND chunk
        list.push(new Uint8Array([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));

        /*--------------------------------------------------------------------

            CREATE IMAGE OBJECTS FOR EACH FRAME BLOB

        --------------------------------------------------------------------*/

        blob = new Blob(list, {type: "image/png"});
        url = URL.createObjectURL(blob);

        img = new Image;
        img.onload = function() {
          URL.revokeObjectURL(this.src);
          if (index === frames - 1) callback();                         // DONE!
        };

        img.onerror = function() {
          console.log("Error creating PNG from frame.");
          if (onerror) {
            onerror("Internal error loading produced PNG")
          }
          else if (index === frames - 1)
            callback();
        };
        img.src = url;

        // Add image to frame Array
        me.frames.push(img);
      });

    }
    else {

      /*--------------------------------------------------------------------

          IS A REGULAR PNG, REPORT IT AS A SINGLE FRAME

      --------------------------------------------------------------------*/

      me.frames.push(new Image);
      me.frames[0].onload = function() {
        URL.revokeObjectURL(this.src);
        me.frameInfo.push({
          x: 0,
          y: 0,
          width: me.width,
          height: me.height,
          delay: -1,
          dispose: 1,
          blend: 0
        });
        callback();
      };
      me.frames[0].src = URL.createObjectURL(new Blob([buffer], {type: "image/png"}))
    }

    /*--------------------------------------------------------------------

        DATAVIEW HELPERS

    --------------------------------------------------------------------*/

    function getU8() {
      return view.getUint8(pos++);
    }

    function getU16() {
      var v = view.getUint16(pos);
      pos += 2;
      return v
    }

    function getU32() {
      var v = view.getUint32(pos);
      pos += 4;
      return v
    }

    function getFourCC() {
      var v = getU32(), c = String.fromCharCode;
      return	c(v >>> 24) + c(v >> 16 & 0xff) + c(v >> 8 & 0xff) + c(v & 0xff);
    }
  }

  // Build a CRC32 LUT-table for makeChunk()
  function buildCRC() {
    var table = new Uint32Array(256), i = 0, j, crc;
    while(i < 256) {
      crc = i>>>0;
      for (j = 0; j < 8; j++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      table[i++] = crc
    }
    return table
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

    var chunk = new Uint8Array(data.length + 12),
        dv = new DataView(chunk.buffer);

    dv.setUint32(0, data.length);
    dv.setUint32(4, makeFourCC(name));
    chunk.set(data, 8);
    dv.setUint32(chunk.length - 4, calcCRC(chunk));

    function makeFourCC(n) {
      var c = n.charCodeAt.bind(n);
      return c(0)<<24 | (c(1) & 0xff)<<16 | (c(2) & 0xff)<<8 | c(3) & 0xff
    }

    function calcCRC(buffer) {
      var crc = (-1>>>0), len = buffer.length - 4, i = 4;
      while(i < len) crc = (crc >>> 8) ^ table[(crc ^ buffer[i++]) & 0xff];
      return crc ^ -1
    }

    return chunk
  }
}