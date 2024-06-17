/*
	APNG Animation Helper

	Copyright (c) 2017, 2024 Epistemex
	License: CC BY-NC-SA 4.0
*/

'use strict';

/**
 * Helper object to animate parsed APNG files (APNGParser objects).
 *
 * The animation is "intelligent" so if a delay is close to 60 FPS (16-17ms)
 * it will use the optimized `requestAnimationFrame()`. The loop can also be
 * overridden via option to force use of this method for all frames.
 *
 * @param {HTMLCanvasElement} canvas - canvas to use. The correct size will be set internally.
 * @param {APNG.Parser} apng - APNGParser object to animate
 * @param {APNGHelperOptions} [options] - options for animation
 * @constructor
 */
APNG.Helper = function(canvas, apng, options) {

  options = Object.assign({}, {
    iterations                : -1,
    ignoreIterations          : true,
    forceRequestAnimationFrame: false,
    mode                      : 'forward',
    debug                     : false,
    debugColorRegion          : '#f0f',
    debugColorText            : '#fff',
    debugTextPosition         : { x: 5, y: 12 },
    debugTextFont             : null
  }, options);

  const me = this;
  const temp = document.createElement('canvas');
  const ctxt = temp.getContext('2d');
  let ctx = canvas.getContext('2d');
  let startTime = -1;
  let currentTime = 0;
  let frames;
  let frameInfo;
  let cFrame = 0;
  let loops = 0;
  let iterations;
  let clrBg = false;
  let commit = true;
  let timeRef;

  /**
   * The 2D context used for the canvas internally.
   * @type {CanvasRenderingContext2D}
   */
  this.context = ctx;

  /**
   * True if animation is playing.
   * @type {boolean}
   */
  this.playing = false;

  /**
   * Optional callback for when an animation starts to play.
   * @type {Function|Null}
   * @fires HelperEvent
   */
  this.onplay =

    /**
     * Optional callback for when an animation is stopped.
     * @type {Function|Null}
     * @fires HelperEvent
     */
    this.onstop = null;

  /**
   * Optional callback for when an animation starts is paused.
   * @type {Function|Null}
   * @fires HelperEvent
   */
  this.onpause = null;

  /**
   * Optional callback for when an animation ended (based on number of
   * iteration). Will not be called if `stop()` is invoked.
   * @type {Function|Null}
   * @fires APNG.Helper#HelperEvent
   */
  this.onended = null;

  /**
   * Optional callback that is called for each rendered frame.
   * This callback is called *after* the frame has been rendered so that
   * you can overlay graphics between each frame.
   *
   * Note: if you use this to draw on the animation, remember to reset
   * your context changes (transformations, composition, clipping etc.).
   *
   * @type {Function|Null}
   * @fires APNG.Helper#HelperEvent
   */
  this.onframe = null;

  /**
   * Optional callback for when a new iteration is started.
   * @type {Function|Null}
   * @fires APNG.Helper#HelperEvent
   */
  this.oniteration = null;

  /**
   * Set or get current playback mode.
   * @member {String} APNGHelper#mode
   */
  defProp('mode',
    function() {return options.mode;},
    function(mode) {

      frames = apng.frames.concat();
      frameInfo = apng.frameInfo.concat();

      if ( mode === 'backward' ) {
        frames.reverse();
        frameInfo.reverse();
      }
      else if ( mode === 'pingpong' ) {
        frames = frames.concat(frames.concat().reverse());
        frameInfo = frameInfo.concat(frameInfo.concat().reverse());
      }

      // Make sure we are within the new length
      if ( cFrame >= frames.length ) cFrame = 0;
      options.mode = mode;
    }
  );

  /**
   * Gets the current frame number.
   *
   * Notes setting a frame:
   *
   * Renders the sequence based on region, dispose and blending for each
   * frame until requested frame is reached. This will produce a correct
   * looking complete frame.
   *
   * If you only want the raw frame use the APNGParser object directly
   * with the property `frame[frameIndex]` instead.
   *
   * The complete frame is rendered to the canvas.
   *
   * @member {Number} APNG.Helper#currentFrame
   */
  defProp('currentFrame',
    function() {return cFrame;},
    function(frame) {
      let i = 0;

      if ( frame < 0 ) frame = 0;
      else if ( frame >= frames.length ) frame = frames.length - 1;

      ctx.canvas.width = canvas.width;
      cFrame = 0;

      while( i++ <= frame ) {
        render();
        cFrame++;
      }

      if ( me.onframe ) me.onframe(getEvent());
    }
  );

  /**
   * Sets or gets the current time in milliseconds.
   * If playing the time is accurate, if paused or stopped the current
   * time represents the closest frame.
   *
   * Setting time will set the frame which the time falls within.
   *
   * @member {Number} APNG.Helper#currentTime
   */
  defProp('currentTime',
    function() {return me.playing ? performance.now() - startTime : currentTime - startTime;},
    function(time) {
      let i = 0;
      let delta = 0;

      while( i < frameInfo.length ) {
        delta += frameInfo[ i ].delay;
        if ( delta >= time ) {
          me.currentFrame = i;
          if ( me.onframe ) me.onframe(getEvent());
          return;
        }
        i++;
      }
    }
  );

  /**
   * Get the duration of the entire animation in milliseconds.
   * The duration considers playback mode. This is a convenience property
   * which wraps the APNG Parser object's duration property.
   *
   * @member {Number} APNG.Helper#duration
   */
  defProp('duration', function() {return apng.duration;});

  /**
   * This property can be set to false when for example the canvas is not
   * visible. The animation will still loop in the background but nothing
   * is actually drawn to the canvas itself.
   *
   * Note: This also blocks calls to onframe callbacks.
   * @member {boolean} APNG.Helper#commit
   */
  defProp('commit',
    function() {return commit;},
    function(state) {
      const prevState = commit;
      commit = !!state;
      if ( !prevState && commit ) me.currentFrame = cFrame;
    }
  );

  /**
   * Enable or disable debugging.
   * @member {boolean} APNG.Helper#debug
   */
  defProp('debug',
    function() {return options.debug;},
    function(state) {options.debug = !!state;}
  );

  /**
   * Set color of text if debugging is enabled.
   * @member {boolean} APNG.Helper#debugColorText
   */
  defProp('debugColorText',
    function() {return ctx.fillStyle;},
    function(color) {ctx.fillStyle = color;}
  );

  /**
   * Set color of region rectangle if debugging is enabled.
   * @member {boolean} APNG.Helper#debugColorRegion
   */
  defProp('debugColorRegion',
    function() {return ctx.strokeStyle;},
    function(color) {ctx.strokeStyle = color;}
  );

  /**
   * Set text position of frame information if debugging is enabled.
   * The argument is an object with properties for x and y.
   * @member {Object} APNG.Helper#debugTextPosition
   */
  defProp('debugTextPosition',
    function() {return options.debugTextPosition;},
    function(pos) {options.debugTextPosition = pos;}
  );

  /**
   * Set font for text for frame information if debugging is enabled.
   * @member {string} APNG.Helper#debugTextFont
   */
  defProp('debugTextFont',
    function() {return ctx.font;},
    function(font) {ctx.font = font;}
  );

  /**
   * Set a new canvas as target for frame rendering. The canvas will be
   * reset and resized to match the APNG.
   * @member {boolean} APNG.Helper#canvas
   */
  defProp('canvas',
    function() {return canvas;},
    function(newCanvas) {
      canvas = newCanvas;
      me.context = ctx = canvas.getContext('2d');
      if ( !ctx ) throw 'This canvas cannot be used for 2D.';
      canvas.width = apng.width;
      canvas.height = apng.height;

      // init debug settings
      if ( options.debugTextFont ) ctx.font = options.debugTextFont;
      ctx.fillStyle = options.debugColorText;
      ctx.strokeStyle = options.debugColorRegion;
    }
  );

  /**
   * Start playing animation from current frame. If iterations is
   * considered it will automatically stop after last iteration (loop)
   * has been played.
   */
  this.play = function() {
    if ( !me.playing ) play();
  };

  /**
   * Stop animation and go to frame 0.
   */
  this.stop = function() {
    if ( !me.playing ) return;

    me.pause();
    cFrame = 0;
    startTime = -1;
    render();

    if ( me.onstop )
      me.onstop(getEvent());
  };

  /**
   * Pause animation at current frame.
   */
  this.pause = function() {
    if ( !me.playing ) return;

    me.playing = false;

    clearTimeout(timeRef);
    cancelAnimationFrame(timeRef);

    if ( me.onpause )
      me.onpause(getEvent());
  };

  /*-----------------------------------------------------------------------------------------------------------------*\

      INTERNALS

  \*-----------------------------------------------------------------------------------------------------------------*/

  function play() {
    const perf = performance.now.bind(performance);

    me.playing = true;

    // render frame, invoke advance
    function loop() {
      const info = frameInfo[ cFrame ];
      if ( commit ) {
        render();
        if ( me.onframe ) me.onframe(getEvent());
      }

      timeRef = (info.delay >= 16 && info.delay <= 17) || options.forceRequestAnimationFrame ?
                requestAnimationFrame(advance) : setTimeout(advance, info.delay);
    }

    // loop progress
    function advance() {
      if ( ++cFrame >= frames.length ) {
        cFrame = 0;
        startTime = perf();
        loops++;
        if ( me.oniteration ) me.oniteration(getEvent());
        if ( loops >= iterations && !options.ignoreIterations ) {
          me.playing = false;
          if ( me.onended ) me.onended(getEvent());
        }
      }

      // render next frame
      currentTime = perf();
      if ( me.playing ) loop();
    }

    startTime = perf();
    loop();

    if ( me.onplay )
      me.onplay(getEvent());
  }

  /**
   * Renders the current frame considering region, dispose and blend.
   * @private
   */
  function render() {

    const frame = frames[ cFrame ];
    const info = frameInfo[ cFrame ];

    // was previous frame using dispose method 2?
    if ( clrBg ) {
      ctx.drawImage(temp, 0, 0);
      clrBg = false;
    }

    // check dispose function
    if ( info.dispose === 1 ) {
      ctx.clearRect(info.x | 0, info.y | 0, info.width | 0, info.height | 0);
    }
    else if ( info.dispose === 2 ) {
      ctxt.clearRect(0, 0, temp.width | 0, temp.height | 0);
      ctxt.drawImage(canvas, info.x | 0, info.y | 0, info.width | 0, info.height | 0, info.x | 0, info.y | 0, info.width | 0, info.height | 0);
      clrBg = true;
    }

    // check blend op.
    if ( info.blend === 0 )
      ctx.clearRect(info.x | 0, info.y | 0, info.width | 0, info.height | 0);

    // render frame
    ctx.drawImage(frame, info.x | 0, info.y | 0);

    // debug info?
    if ( options.debug ) {
      ctx.strokeRect((info.x | 0) + 0.5, (info.y | 0) + 0.5, (info.width - 1) | 0, (info.height - 1) | 0);
      ctx.fillText('F:' + cFrame + '  D:' + info.dispose + '  B:' + info.blend, options.debugTextPosition.x, options.debugTextPosition.y);
    }
  }

  function getEvent() {
    return { timeStamp: Date.now(), context: ctx, target: me };
  }

  function defProp(name, getter, setter) {
    const def = { get: getter };
    if ( setter ) def.set = setter;
    Object.defineProperty(me, name, def);
  }

  /*-----------------------------------------------------------------------------------------------------------------*\

      SETUP AND INITIALIZATIONS

  \*-----------------------------------------------------------------------------------------------------------------*/

  // Initialize main + internal (dispose 2 mode) canvas
  canvas.width = temp.width = apng.width;
  canvas.height = temp.height = apng.height;

  iterations = options.iterations < 0 ?                                 // if option no. < 0 then ignore option and use original
               apng.iterations : options.iterations;

  if ( !iterations ) {
    options.ignoreIterations = true;                                    // 0 means infinite iterations
  }
  else if ( iterations < 0 ) {                                          // if we still have -1 (single frame from original PNG)
    options.ignoreIterations = !!(iterations = 0);                      // don't ignore iterations, but use 0 so we only render one frame and stop
  }

  // Init debug colors
  ctx.fillStyle = options.debugColorText;
  ctx.strokeStyle = options.debugColorRegion;
  if ( options.debugTextFont ) ctx.font = options.debugTextFont;

  // Init playback mode (!)
  me.mode = options.mode;                                               // this call also sets up frames/info arrays
};

/**
 * Produces a horizontal sprite-sheet from a APNG.Parser object.
 * Each cell is the same size as the entire frame. This can be used as
 * an efficient replacement for the APNGHelper as each frame is complete.
 *
 * @param {APNG.Parser} apng - APNG.Parser object.
 * @param {*} [options] - a callback that is called for each cell so you can overlay graphics.
 * @param {Function} [options.drawCallback] - a callback that is called for each cell so you can overlay graphics.
 * @param {Number} [options.maxWidth=8000] - max width of canvas - note that some browser limits the size of the canvas element.
 *   if not wide enough the height is adjusted to generate rows instead.
 * @returns {HTMLCanvasElement}
 * @static
 */
APNG.Helper.toSpritesheet = function(apng, options) {

  options = Object.assign({}, {
    maxWidth    : 6000,
    drawCallback: null
  }, options);

  const c1 = document.createElement('canvas');                         // internal canvas for helper
  const c2 = document.createElement('canvas');                         // final canvas sprite-sheet
  const ctx = c2.getContext('2d');
  const anim = new APNG.Helper(c1, apng);                                       // temporary instance
  let cnt;

  if ( options.drawCallback )
    anim.onframe = options.drawCallback;

  if ( apng.width * apng.frames.length > options.maxWidth ) {                   // too many cells to fit horizontally?
    cnt = Math.floor(options.maxWidth / apng.width);                         // get number of cells horizontally
    c2.width = cnt * apng.width;                                                // get an actual width based on count
    c2.height = Math.ceil((apng.width * (apng.frames.length)) / options.maxWidth) * apng.height; // get actual height
  }
  else {
    c2.width = apng.width * apng.frames.length;                                 // single row, size of sprite-sheet
    c2.height = apng.height;
  }

  // Render the cells
  for(let i = 0, x = 0, y = 0; i < apng.frames.length; i++) {
    anim.currentFrame = i;
    ctx.drawImage(c1, x, y);
    x += apng.width;
    if ( x >= options.maxWidth ) {
      x = 0;
      y += apng.height;
    }
  }

  return ctx.canvas;
};

/**
 * Utility method that can re-time the animation.
 * @param {APNG.Parser} apng - a parser object to re-time
 * @param {Number} timeScale - a normalized scale value (1 = 100%, 0.5 = 50%, 2 = 200% etc.)
 * @static
 */
APNG.Helper.retime = function(apng, timeScale) {
  this._cd(function(info) {info.delay *= timeScale;});
};

/**
 * Utility method to scale the total duration. Time is given in milliseconds.
 * Each frame in the animation is scaled with the same scale factor internally.
 *
 * Note: the duration must be considered an approximation of duration.
 *
 * @param {APNG.Parser} apng - a parser object to re-time
 * @param {Number} duration - new duration in milliseconds
 * @static
 */
APNG.Helper.setDuration = function(apng, duration) {
  const timeScale = duration / apng.duration;
  this._cd(function(info) {info.delay *= timeScale;});
};

/**
 * Utility method to set new delay for each frame. Overrides all existing
 * delays.
 *
 * @param {APNG.Parser} apng - a parser object to re-time
 * @param {Number} delay - new frame delay in milliseconds
 * @static
 */
APNG.Helper.setDelay = function(apng, delay) {
  this._cd(function(info) {info.delay = delay;});
};

/**
 * Common function handler to update duration properly.
 * @param {Function} fn - calculation function with internal references. The function is given an frameInfo object
 * @private
 */
APNG.Helper._cd = function(fn) {
  const fi = apng.frameInfo;
  fi.forEach(fn);
  apng.duration = fi.reduce(function(prev, curr) {return prev + curr.delay;}, 0);
};

/**
 * @name APNGHelperOptions
 * @prop {Number} [options.iterations=-1] - number of iterations. If > -1 it will override the original number of iterations
 * @prop {Boolean} [options.ignoreIterations=true] - will loop indefinitely if true (default), otherwise number of iterations is considered.
 * @prop {Boolean} [options.forceRequestAnimationFrame=false] - override timing and force use of `requestAnimationFrame()` for all frames.
 * @prop {String} [options.mode="forward"] - playback mode: forward, backward, ping-pong. NOTE: These modes are not part of the Animation PNG standard.
 *  They may also not be compatible will a APNG files depending on their region and dispose/blend modes.
 * @prop {Boolean} [options.debug=false] - if true will draw current region rectangle, frame number, dispose and blend modes on each frame
 * @prop {string} [options.debugColorText="#fff"] - set color for debug text when debug=true
 * @prop {string} [options.debugColorRegion="#f0f"] - set color for debug rectangle when debug=true
 * @prop {string} [options.debugTextPosition={x: 5, y: 12}] - set text position if debug=true
 * @prop {string} [options.debugTextFont="10px sans-serif"] - set font for text if debug=true
 */

/**
 * Event object dispatched for APNG.Helper callbacks.
 *
 * @event APNG.Helper#HelperEvent
 * @prop {Number} timeStamp - time stamp in ms. for when this event was created
 * @prop {CanvasRenderingContext2D} context - rendering context used for this instance
 * @prop {APNG.Helper} target - reference to instance of helper invoking the event
 */
