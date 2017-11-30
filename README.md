apng-parser
===========

Parse Animated PNG files into single frames. Does not animate the frames
but provide them for the program so it can animate or analyze the file.

The package comes with a handy animation helper object that can handle 
the animation, render out a single frame correctly, provide events for 
each frame etc. 


Features
--------

- Parses Animated PNG (APNG) files and builds individual PNG files from each raw frame.
- Provide frames as raw frames (regions, offsets preserved).
- Provide frames as rendered (via the helper)
- Helper can render individual frames to canvas
- Helper can play *forward* as well as non-standard *backward* and *ping-pong*
- Helper can generate full-frame sprite-sheets for efficient animations and debugging
- Non-blocking and asynchronous
- Fast and easy to use.


Usage
-----

    var apng = new APNGParser(url|blob|file|buffer, callback [,onerror]);

Produces an object holding each individual frame as image as well as individual
frame and animation information.

You can animate it manually, or use the included `APNGHelper` object:

    var anim = new APNGHelper(canvas, apng, options);
    anim.play();                    // play, stop, pause
    anim.gotoFrame(n);              // renders a full frame correctly
    anim.onframe = function(e) {    // various callbacks available
      // render overlay via e.context
    };

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
