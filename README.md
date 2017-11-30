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
- Helper can play forward as well as non-standard backward and ping-pong
- Helper can generate full-frame sprite-sheets for efficient animations
- Non-blocking and asynchronous
- Fast and easy to use.


Install
-------

**apng-parser** can be installed in various ways:

- Git using HTTPS: `git clone https://gitlab.com/epistemex/apng-parser.git`
- Git using SSH: `git clone git@gitlab.com:epistemex/apng-parser.git`
- Download [zip archive](https://gitlab.com/epistemex/apng-parser/repository/archive.zip?ref=master) and extract.
- Download [tar ball](https://gitlab.com/epistemex/apng-parser/repository/archive.tar.gz?ref=master) and extract.

	
Usage
-----

    var apng = new APNGParser(url|blob|file|buffer, callback [,onerror]);

Produces an object holding each individual frame as image as well as individual
frame and animation information.

You can animate it manually, or use the included `APNGHelper` object:

    var anim = new APNGHelper(canvas, apng, options);
    anim.play();                    // play, stop, pause
    anim.gotoFrame(n);  			// renders a full frame correctly
    anim.onframe = function() {     // various callbacks available
      // render overlay
    };

See included HTML documentation for details.


Issues
------

See the [issue tracker](https://gitlab.com/epistemex/apng-parser/issues) for details.


License
-------

[Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/)

[![License](https://i.creativecommons.org/l/by-nc-sa/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

[Contact us](mailto:github@epistemex.com) if you need a commercial license.

*&copy; Epistemex 2017*
 
![Epistemex](http://i.imgur.com/GP6Q3v8.png)
