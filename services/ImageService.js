var config = require('config');

var fs = require('fs');
var FileQueue = require('filequeue');
var fq = new FileQueue(100);

var stream = require('stream');

var PNG = require('pngjs').PNG;
var PNGImage = require('pngjs-image');
var lwip = require('lwip');

// logger
var winston = require('winston');
var logger = winston.loggers.get('space_log');


exports.detectType = _detectType;
exports.convertToCirclePng = _convertToCirclePng;

/**
*
+ converts to png
+ scales down to normalized size
+ squarifies crop
+ circle crop
+ save as png
*/
function _convertToCirclePng(_source,size,callback){
	_openFile(_source,function(err,buffer){
	  logger.debug("1) loaded file: "+_source+" into buffer...");
	  var _type;
	  _type = _detectType(buffer);
	  logger.debug("2) detect type: "+_type);

	  //lwip needs to know the type
	  lwip.open(buffer,_type,function(err,image){
			if (image){
				var _w = image.width();
		    var _h = image.height();
		    logger.debug("3) lwip loaded buffer: "+_source+" width: "+_w+" - height: "+_h);

				var _ratio = _w/size;

				image.resize(_w/_ratio,_h/_ratio,"lanczos",function(err,image){
					logger.debug("4) lwip images resize: [OK] width: "+(_w/_ratio)+" height: "+_h/_ratio);
			    var _cropSize = size;
			    image.crop(_cropSize,_cropSize,function(err,image){
			      if (err){
							logger.error("5) lwip image crop: [FAILED] "+err.message);
						}
						logger.debug("5) lwip image crop: [OK] "+_cropSize+" cropSize");
						image.toBuffer("png",{},function(err,buffer){
							logger.debug("6) lwip creates buffer...");
							_toCircle(_source,buffer,function(err,result){
				        logger.debug("7) lwip writes PNG file..."+_source+"_circle.png");
								callback(err,"OK");
		      		})
		      	})
			    })
		  	})
			}
			else{
				callback(null,null);
			}
		})


	});
}



function _toCircle(source,buffer,callback){
	logger.debug("_toCircle for buffer called...");
	var bufferStream = new stream.PassThrough();
	bufferStream.end( buffer );
	bufferStream
		.pipe(new PNG({
				filterType: 4
		}))
		.on('parsed', function() {
		for (var y = 0; y < this.height; y++) {
			for (var x = 0; x < this.width; x++) {
				var idx = (this.width * y + x) << 2;
				var radius = this.width / 2;
				if(y >= Math.sqrt(Math.pow(radius, 2) - Math.pow(x - radius, 2)) + radius || y <= -(Math.sqrt(Math.pow(radius, 2) - Math.pow(x - radius, 2))) + radius) {
						this.data[idx + 3] = 0;
				}
			}
		}
		var _dir = _.initial(source.split("/")).join("/");
		var _file = _.last(source.split("/"));
		logger.debug("_dir: "+_dir);
		logger.debug("_file: "+_file);
		var _out = _dir+"/"+_file+"_circle.png";
		//logger.debug("_out: "+_out);
		this.pack().pipe(fs.createWriteStream(_out));
		callback(null,"ok");
	});
}

/**
* thanks to http://stackoverflow.com/questions/8473703/in-node-js-given-a-url-how-do-i-check-whether-its-a-jpg-png-gif
*/
function _detectType(buffer){
	console.log("------------------");
	var magic = {
	    jpg: 'ffd8ffe0',
			jpg2: 'ffd8ffe1',

	    png: '89504e47',
	    gif: '47494638'
	};
	console.log("magic byte: "+buffer.toString('hex',0,4));
  var magigNumberInBody = buffer.toString('hex',0,4);
	if (magigNumberInBody == magic.jpg || magigNumberInBody == magic.jpg2) type ="jpg";
	else if (magigNumberInBody == magic.png) type ="png";
	else if (magigNumberInBody == magic.gif) type="gif";

	return type;
}


function _openFile(_url,callback){

  fs.readFile(_url, function (err, buffer) {
    logger.debug("trying to open file: "+_url);
		if (err){
			logger.error(err.message);
			throw err;
		}
    callback(err,buffer);
  });
}
