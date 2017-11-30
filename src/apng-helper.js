/*
	APNG Animation Helper ver 0.4.0 alpha
	Copyright (c) 2017 Epistemex
	License: CC BY-NC-SA 4.0
*/

"use strict";

APNG = APNG || {};

/**
 * Helper object to animate parsed APNG files (APNGParser objects).
 *
 * The animation is "intelligent" so if a delay is close to 60 FPS (16-17ms)
 * it will use the optimized `requestAnimationFrame()`. The loop can also be
 * overridden via option to force use of this method for all frames.
 *
 * @param {HTMLCanvasElement} canvas - canvas to use. The correct size will be set internally.
 * @param {APNG.Parser} apng - APNGParser object to animate
 * @param {*} [options] - options for animation
 * @param {Number} [options.iterations=-1] - number of iterations. If > -1 it will override the original number of iterations
 * @param {Boolean} [options.ignoreIterations=true] - will loop indefinitely if true (default), otherwise number of iterations is considered.
 * @param {Boolean} [options.forceRequestAnimationFrame=false] - override timing and force use of `requestAnimationFrame()` for all frames.
 * @param {String} [options.mode="forward"] - playback mode: forward, backward, ping-pong. NOTE: These modes are not part of the Animation PNG standard.
 * @constructor
 */
APNG.Helper = function(canvas, apng, options) {

  options = Object.assign({
    iterations                : -1,
    ignoreIterations          : true,
    forceRequestAnimationFrame: false,
    mode                      : "forward"
  }, options);

  var me = this,
      startTime = -1,
      currentTime = 0,
      frames,
      frameInfo,
      cFrame = 0,
      loops = 0,
      iterations,
      clrBg = false,
      temp = document.createElement("canvas"),
      ctxt = temp.getContext("2d"),
      ctx = canvas.getContext("2d"),
      ref,
      commit = true,
      play = false;

  /**
   * The 2D context used for the canvas internally.
   * @type {CanvasRenderingContext2D}
   * @fires APNG.Helper#event
   */
  this.context = ctx;

  /**
   * Optional callback for when an animation starts to play.
   * @type {Function|Null}
   * @fires APNG.Helper#event
   */
  this.onplay =

  /**
   * Optional callback for when an animation is stopped.
   * @type {Function|Null}
   * @fires APNG.Helper#event
   */
  this.onstop =

  /**
   * Optional callback for when an animation starts is paused.
   * @type {Function|Null}
   * @fires APNG.Helper#event
   */
  this.onpause =

  /**
   * Optional callback for when an animation ended (based on number of
   * iteration). Will not be called if `stop()` is invoked.
   * @type {Function|Null}
   * @fires APNG.Helper#event
   */
  this.onend =

  /**
   * Optional callback that is called for each rendered frame.
   * This callback is called *after* the frame has been rendered so that
   * you can overlay graphics between each frame.
   *
   * Note: if you use this to draw on the animation, remember to reset
   * your context changes (transformations, composition, clipping etc.).
   *
   * @type {Function|Null}
   * @fires APNG.Helper#event
   */
  this.onframe =

  /**
   * Optional callback for when a new iteration is started.
   * @type {Function|Null}
   * @fires APNG.Helper#event
   */
  this.oniteration = null;

  /**
   * Set or get current playback mode.
   * @member {String} APNGHelper#mode
   */
  defProp("mode",
    function() {return options.mode},
    function(mode) {

      frames = apng.frames.concat();
      frameInfo = apng.frameInfo.concat();

      if (mode === "backward") {
        frames.reverse();
        frameInfo.reverse();
      }
      else if (mode === "pingpong") {
        frames = frames.concat(frames.concat().reverse());
        frameInfo = frameInfo.concat(frameInfo.concat().reverse());
      }

      // Make sure we are within the new length
      if (cFrame >= frames.length) cFrame = 0;
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
  defProp("currentFrame",
    function() {return cFrame},
    function(frame) {
      var i = 0;

      if (frame < 0) frame = 0;
      else if (frame >= frames.length) frame = frames.length - 1;

      ctx.canvas.width = canvas.width;
      cFrame = 0;

      while(i++ <= frame) {
        render();
        cFrame++;
      }

      if (me.onframe) me.onframe(getEvent());
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
  defProp("currentTime",
    function() {return play ? performance.now() - startTime : currentTime - startTime},
    function(time) {
      var i = 0, delta = 0;
      while(i < frameInfo.length) {
        delta += frameInfo[i].delay;
        if (delta >= time) {
          me.currentFrame = i;
          if (me.onframe) me.onframe(getEvent());
          return;
        }
        i++
      }
    }
  );

  /**
   * Get the duration of the entire animation in milliseconds.
   * The duration considers playback mode.
   *
   * @member {Number} APNG.Helper#duration
   */
  defProp("duration",
    function() {
      var duration = 0;
      frameInfo.forEach(function(info) {duration += info.delay});
      return duration
    }
  );

  /**
   * This property can be set to false when for example the canvas is not
   * visible. The animation will still loop in the background but nothing
   * is actually drawn to the canvas itself.
   *
   * Note: This also blocks calls to onframe callbacks.
   * @member {boolean} APNG.Helper#commit
   */
  defProp("commit",
    function() {return commit},
    function(state) {
      var prevState = commit;
      commit = !!state;
      if (!prevState && commit) me.currentFrame = cFrame;
    }
  );

  /**
   * Start playing animation from current frame. If iterations is
   * considered it will automatically stop after last iteration (loop)
   * has been played.
   */
  this.play = function() {

    play = true;

    function loop() {
      var info = frameInfo[cFrame];
      if (commit) {
        render();
        if (me.onframe) me.onframe(getEvent());
      }
      ref = (info.delay >= 16 && info.delay <= 17) || options.forceRequestAnimationFrame ?
            requestAnimationFrame(advance) : setTimeout(advance, info.delay);
    }

    function advance() {

      if (++cFrame >= frames.length) {
        cFrame = 0;
        startTime = performance.now();
        loops++;
        if (me.oniteration) me.oniteration(getEvent());
        if (loops >= iterations && !options.ignoreIterations) {
          play = false;
          if (me.onended) me.onended(getEvent());
        }
      }

      currentTime = performance.now();
      if (play) loop();
    }

    startTime = performance.now();

    loop();

    if (me.onplay)
      me.onplay(getEvent());
  };

  /**
   * Stop animation and go to frame 0.
   */
  this.stop = function() {
    me.pause();
    cFrame = 0;
    startTime = -1;
    render();

    if (me.onstop)
      me.onstop(getEvent());
  };

  /**
   * Pause animation at current frame.
   */
  this.pause = function() {

    play = false;

    clearTimeout(ref);
    cancelAnimationFrame(ref);

    if (me.onpause)
      me.onpause(getEvent());
  };

  /**
   * Renders the current frame considering region, dispose and blend.
   * @private
   */
  function render() {

    var frame = frames[cFrame],
        info = frameInfo[cFrame];

    // was previous frame using dispose method 2?
    if (clrBg) {
      ctx.drawImage(temp, 0, 0);
      clrBg = false;
    }

    // check dispose function
    if (info.dispose === 1) {
      ctx.clearRect(info.x, info.y, info.width, info.height)
    }
    else if (info.dispose === 2) {
      ctxt.clearRect(0, 0, temp.width, temp.height);
      ctxt.drawImage(canvas, info.x, info.y, info.width, info.height, info.x, info.y, info.width, info.height);
      clrBg = true;
    }

    // check blend op.
    if (info.blend === 0)
      ctx.clearRect(info.x, info.y, info.width, info.height);

    // render frame
    ctx.drawImage(frame, info.x, info.y);
  }

  function getEvent() {
    return {timeStamp: Date.now(), context: ctx, target: me}
  }

  function defProp(name, getter, setter) {
    var def = {get: getter};
    if (setter) def.set = setter;
    Object.defineProperty(me, name, def);
  }
  /*--------------------------------------------------------------------

      SETUP AND INITIALIZATIONS

  --------------------------------------------------------------------*/

  // Initialize main + internal (dispose 2 mode) canvas
  canvas.width = temp.width = apng.width;
  canvas.height = temp.height = apng.height;

  iterations = options.iterations < 0 ?                                 // if option no. < 0 then ignore option and use original
                 apng.iterations : options.iterations;

  if (!iterations) {
    options.ignoreIterations = true;                                    // 0 means infinite iterations
  }
  else if (iterations < 0) {                                            // if we still have -1 (single frame from original PNG)
    options.ignoreIterations = !!(iterations = 0);                      // don't ignore iterations, but use 0 so we only render one frame and stop
  }

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

  options = Object.assign({
    maxWidth: 8000,
    drawCallback: null
  }, options);

  var c1 = document.createElement("canvas"),                            // internal canvas for helper
      c2 = document.createElement("canvas"),                            // final canvas sprite-sheet
      ctx = c2.getContext("2d"),
      anim = new APNG.Helper(c1, apng),                                 // temporary instance
      cnt;

  if (options.drawCallback)
    anim.onframe = options.drawCallback;

  if (apng.width * apng.frames.length > options.maxWidth) {             // too many cells to fit horizontally?
    cnt = Math.floor(options.maxWidth / apng.width);                    // get number of cells horizontally
    c2.width = cnt * apng.width;                                        // get an actual width based on count
    c2.height = Math.ceil((apng.width * apng.frames.length) / options.maxWidth) * apng.height; // get actual height
  }
  else {
    c2.width = apng.width * apng.frames.length;                         // single row, size of sprite-sheet
    c2.height = apng.height;
  }

  // Render the cells
  for(var i = 0, x = 0, y = 0; i < apng.frames.length; i++) {
    anim.currentFrame = i;
    ctx.drawImage(c1, x, y);
    x += apng.width;
    if (x > options.maxWidth) {
      x = 0;
      y += apng.height;
    }
  }

  return ctx.canvas
};


/**
 * Event object.
 *
 * @event APNG.Helper#event
 * @type {object}
 * @property {Number} timeStamp - time stamp in ms. for when this event was created
 * @property {CanvasRenderingContext2D} context - rendering context used for this instance
 * @property {*} target - reference to instance of helper invoking the event
 */
