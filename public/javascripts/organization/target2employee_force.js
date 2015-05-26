	/** does NOT work yet as outsourced module .....

	=> used by the different "employee2target BROCCOLI" views


	var data,root;


	var width = 1000
	var height = 600;

	var _charge = -80;
	var _distance = 120;

	if(!"#{pickL2}"){
		width=2000;
		height=1500;

		_charge=-50;
		_distance=50;
	}
	//var color = d3.scale.category20();
	var force = d3.layout.force().charge(_charge).linkDistance(_distance).size([width, height]);
	var svg = d3.select("#broccoli").append("svg").attr("width", width).attr("height", height);

	var nodes,links;

	// /api/space/rest/organization/employee/
	// http://my.bwinparty.com/api/people/images/e2988


	//var _dataUri = "/api/space/rest/initiatives";
	//var _dataUri = "/api/space/rest/target2employee";
	var _dataUri = "/api/space/rest/employeebytargets?pickL2=#{pickL2}&showEmployeeTree=#{showEmployeeTree}&showTargetTree=#{showTargetTree}";
	//var _dataUri = "./test.json";

	var _orgUri = "/api/space/rest/organization";
	var _targetUri = "/api/space/rest/targets";
	console.log("...");
	d3.json(_orgUri,function(organization){
		console.log("...org");
		d3.json(_dataUri,function(data){
			//console.log("*************data: "+JSON.stringify(data));
			//console.log("*************organization: "+organization.length);

			//root = _.nest(data,["context","employeeID","targets"]);

			root = data[0];

			console.log("---------------------- root: "+JSON.stringify(root));

			nodes = flatten(root),
			links = d3.layout.tree().links(nodes);

			console.log("nodes: "+JSON.stringify(nodes));

			force.nodes(nodes).links(links).start();

			var link = svg.selectAll(".link").data(links).enter().append("line").attr("class", "link").style("stroke-width", function(d) { return Math.sqrt(d.value); });

			var i=0;
			var node = svg.selectAll("node").data(nodes).enter().append("g").each(function(d){
					// items on leaf level
					if (!d.children){
						 var _w = 100/5;
						 var _h = 125/5;
						 var _x = -(_w/2);
						 var _y =0;//(_h-15);

						 /*
						 if (d.id =="E2988"){
							 _w=100;
							 _h=125;
						 }
						 */

						 var _weight="normal";

						 if (d.type=="target") _weight="bold";


						d3.select(this).append("text").text(function(d){return d.name+" "+d.id}).style("font-size","6px").style("font-weight",_weight).style("font-family","arial").attr("dy",_h+8).style("text-anchor","middle");

						//var _imageSource="http://my.bwinparty.com/api/people/images/";
						var _imageSource="/images/employees/squared/";
						var _imageExtension ="_square.png";

						d3.select(this).append("svg:image").attr("xlink:href", function(d){return _imageSource+d.id+_imageExtension;}).attr("imageID",d.id).attr("x", _x).attr("y", _y).attr("width", _w).attr("height", _h);


					}
					else{
						//not leaf
				 console.log("***** has children: "+d.name+" i: "+i+" x,y "+d.x+" , "+d.y);

				 var _weight="normal";
				 var _color ="limegreen";
				 var _circleColor ="lightgrey";
				 var _fontSize=8;
				 var _size = 10;
				 var _text ="";
				 var _color="black";
				 var _dy=10;

				if (d.type=="L2target") _weight="bold";
				 if (d.name=="bpty.studios") _color="grey";
				 if (_.startsWith(d.name,"R")) _circleColor="#00b8e4";
				 if (_.startsWith(d.name,"G")) _circleColor="#82cec1";
				 if (_.startsWith(d.name,"T")) _circleColor="#f99d1c";

				 if (d.name=="RUN" || d.name=="GROW" || d.name=="TRANSFORM"){
						_weight="bold";
						_fontSize = 20;
						_size=15;
						_text = d.name;
						_color =_circleColor;
						_dy =30;
				 }

					else if (d.group) {
						_text = d.name+" - "+d.group;
						_fontSize=18;
						_weight="bold";
					}
					else {
						_text =d.name;
						_fontSize=12;
						_weight="bold";
					}


					 if (d.size) _size = d.size;

						d3.select(this).append("circle").attr("class", "node").attr("r", function(d){return _size/2;}).style("fill", _circleColor);
					 	d3.select(this).append("text").text(_text).style("font-size",_fontSize+"px").style("font-family","arial").style("font-weight",_weight).attr("dy",_dy).style("text-anchor","middle").style("fill",_color);

					}
					d3.select(this).call(force.drag);

			d3.select(this).append("title").text(function(d) { return d.name; });
			i++;


			force.on("tick", function(e) {
				// Push sources up and targets down to form a weak tree.
				/*
				var k = 6 * e.alpha;
				links.forEach(function(d, i) {
					d.source.y -= k;
					d.target.y += k;
				});
				 node.attr("cx", function(d) { return d.x; }).attr("cy", function(d) { return d.y; });
				*/


				link.attr("x1", function(d) { return d.source.x; }).attr("y1", function(d) { return d.source.y; }).attr("x2", function(d) { return d.target.x; }).attr("y2", function(d) { return d.target.y; });

				var _size;
				if (d.size) _size=d.size/10;
				else _size = 1;

					node.attr("transform",function(d){return "translate ("+d.x+","+d.y+") scale("+_size+")"});
			});
		});
	});

	})

	// Returns a list of all nodes under the root.
	function flatten(root) {
		var nodes = [], i = 0;

		function recurse(node) {
			if (node.children) node.children.forEach(recurse);
			if (!node.id) node.id = ++i;
			nodes.push(node);
		}
		recurse(root);
		return nodes;
	}
