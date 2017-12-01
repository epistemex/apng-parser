apng-parser
===========

Parse Animated PNG files into single frames that can be used for 
animation and analyzis.

The package comes with a handy animation helper object that can handle 
the animation, render out a single frame correctly, provide events for 
each frame, adjust timings and perform visual debugging. 

**NOTE: Currently in *alpha* - API is subject to change with no prior notice.
Use for testing only.**


Features
--------

- Parses Animated PNG (APNG) files and builds individual PNG files from each raw frame.
- Provide frames as raw frames (regions, offsets preserved).
- Provide frames as rendered (via the helper)
- Helper can render individual frames to canvas
- Helper can retime, change duration and frame delay
- Helper can play *forward* as well as non-standard *backward* and *ping-pong*
- Helper can render debug information to each frame
- Helper can generate full-frame sprite-sheets for efficient animations and debugging
- Non-blocking and asynchronous
- Fast and easy to use
- Runs in all evergreen browsers


Usage
-----

```javascript
var apng = new APNG.Parser(url|blob|file|buffer, callback [,onerror]);
var rawFrame = apng.frames[n];      // raw frame n (region, no dipose/blend)
var info = apng.frameInfo[n];       // get information about frame n
```
 
Produces an object holding each individual frame as image as well as individual
frame and animation information.

You can animate it manually, or use the included `APNG.Helper` object (which can
also be used to render out single frames based on dispose and blend operations):
```javascript
var anim = new APNG.Helper(canvas, apng, options);
anim.play();                        // play, stop, pause
anim.currentFrame = n;              // renders full frame n
anim.onframe = function(e) {        // various callbacks available
  // here you can render overlays via e.context
};
anim.debug = true;                  // render debug information onto the frames
```

See included HTML documentation for details.


Issues
------

See the [issue tracker](https://github.com/epistemex/apng-parser/issues) for details.


License
-------

[Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/)

[![License](https://i.creativecommons.org/l/by-nc-sa/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

[Contact us](mailto:github@epistemex.com) if you need a commercial license.

*&copy; Epistemex 2017*
 
![Epistemex](http://i.imgur.com/GP6Q3v8.png)
