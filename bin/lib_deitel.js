(function() {

d3.hexbin = function() {
  var width = 1,
      height = 1,
      r,
      x = d3_hexbinX,
      y = d3_hexbinY,
      dx,
      dy;

  function hexbin(points) {
    var binsById = {};

    points.forEach(function(point, i) {
      var py = y.call(hexbin, point, i) / dy, pj = Math.round(py),
          px = x.call(hexbin, point, i) / dx - (pj & 1 ? .5 : 0), pi = Math.round(px),
          py1 = py - pj;

      if (Math.abs(py1) * 3 > 1) {
        var px1 = px - pi,
            pi2 = pi + (px < pi ? -1 : 1) / 2,
            pj2 = pj + (py < pj ? -1 : 1),
            px2 = px - pi2,
            py2 = py - pj2;
        if (px1 * px1 + py1 * py1 > px2 * px2 + py2 * py2) pi = pi2 + (pj & 1 ? 1 : -1) / 2, pj = pj2;
      }

      var id = pi + "-" + pj, bin = binsById[id];
      if (bin) bin.push(point); else {
        bin = binsById[id] = [point];
        bin.i = pi;
        bin.j = pj;
        bin.x = (pi + (pj & 1 ? 1 / 2 : 0)) * dx;
        bin.y = pj * dy;
      }
    });

    return d3.values(binsById);
  }

  function hexagon(radius) {
    var x0 = 0, y0 = 0;
    return d3_hexbinAngles.map(function(angle) {
      var x1 = Math.sin(angle) * radius,
          y1 = -Math.cos(angle) * radius,
          dx = x1 - x0,
          dy = y1 - y0;
      x0 = x1, y0 = y1;
      return [dx, dy];
    });
  }

  hexbin.x = function(_) {
    if (!arguments.length) return x;
    x = _;
    return hexbin;
  };

  hexbin.y = function(_) {
    if (!arguments.length) return y;
    y = _;
    return hexbin;
  };

  hexbin.hexagon = function(radius) {
    if (arguments.length < 1) radius = r;
    return "m" + hexagon(radius).join("l") + "z";
  };

  hexbin.centers = function() {
    var centers = [];
    for (var y = 0, odd = false, j = 0; y < height + r; y += dy, odd = !odd, ++j) {
      for (var x = odd ? dx / 2 : 0, i = 0; x < width + dx / 2; x += dx, ++i) {
        var center = [x, y];
        center.i = i;
        center.j = j;
        centers.push(center);
      }
    }
    return centers;
  };

  hexbin.mesh = function() {
    var fragment = hexagon(r).slice(0, 4).join("l");
    return hexbin.centers().map(function(p) { return "M" + p + "m" + fragment; }).join("");
  };

  hexbin.size = function(_) {
    if (!arguments.length) return [width, height];
    width = +_[0], height = +_[1];
    return hexbin;
  };

  hexbin.radius = function(_) {
    if (!arguments.length) return r;
    r = +_;
    dx = r * 2 * Math.sin(Math.PI / 3);
    dy = r * 1.5;
    return hexbin;
  };

  return hexbin.radius(1);
};

var d3_hexbinAngles = d3.range(0, 2 * Math.PI, Math.PI / 3),
    d3_hexbinX = function(d) { return d[0]; },
    d3_hexbinY = function(d) { return d[1]; };

})();;/*
 Leaflet.markercluster, Provides Beautiful Animated Marker Clustering functionality for Leaflet, a JS library for interactive maps.
 https://github.com/Leaflet/Leaflet.markercluster
 (c) 2012-2013, Dave Leaver, smartrak
*/
(function (window, document, undefined) {
/*
 * L.MarkerClusterGroup extends L.FeatureGroup by clustering the markers contained within
 */

L.MarkerClusterGroup = L.FeatureGroup.extend({

	options: {
		maxClusterRadius: 80, //A cluster will cover at most this many pixels from its center
		iconCreateFunction: null,

		spiderfyOnMaxZoom: true,
		showCoverageOnHover: true,
		zoomToBoundsOnClick: true,
		singleMarkerMode: false,

		disableClusteringAtZoom: null,

		// Setting this to false prevents the removal of any clusters outside of the viewpoint, which
		// is the default behaviour for performance reasons.
		removeOutsideVisibleBounds: true,

		//Whether to animate adding markers after adding the MarkerClusterGroup to the map
		// If you are adding individual markers set to true, if adding bulk markers leave false for massive performance gains.
		animateAddingMarkers: false,

		//Increase to increase the distance away that spiderfied markers appear from the center
		spiderfyDistanceMultiplier: 1,

		//Options to pass to the L.Polygon constructor
		polygonOptions: {}
	},

	initialize: function (options) {
		L.Util.setOptions(this, options);
		if (!this.options.iconCreateFunction) {
			this.options.iconCreateFunction = this._defaultIconCreateFunction;
		}

		this._featureGroup = L.featureGroup();
		this._featureGroup.on(L.FeatureGroup.EVENTS, this._propagateEvent, this);

		this._nonPointGroup = L.featureGroup();
		this._nonPointGroup.on(L.FeatureGroup.EVENTS, this._propagateEvent, this);

		this._inZoomAnimation = 0;
		this._needsClustering = [];
		this._needsRemoving = []; //Markers removed while we aren't on the map need to be kept track of
		//The bounds of the currently shown area (from _getExpandedVisibleBounds) Updated on zoom/move
		this._currentShownBounds = null;

		this._queue = [];
	},

	addLayer: function (layer) {
console.log('addLayer....');
// console.log(this._map);
		if (layer instanceof L.LayerGroup) {
			var array = [];
			for (var i in layer._layers) {
				array.push(layer._layers[i]);
			}
			// console.log(array);
			return this.addLayers(array);
		}

		//Don't cluster non point data
		if (!layer.getLatLng) {
			this._nonPointGroup.addLayer(layer);
			return this;
		}

		if (!this._map) {
			this._needsClustering.push(layer);
			return this;
		}

		if (this.hasLayer(layer)) {
			return this;
		}


		//If we have already clustered we'll need to add this one to a cluster

		if (this._unspiderfy) {
			this._unspiderfy();
		}

		this._addLayer(layer, this._maxZoom);

		//Work out what is visible
		var visibleLayer = layer,
			currentZoom = this._map.getZoom();
		if (layer.__parent) {
			while (visibleLayer.__parent._zoom >= currentZoom) {
				visibleLayer = visibleLayer.__parent;
			}
		}

		if (this._currentShownBounds.contains(visibleLayer.getLatLng())) {
			if (this.options.animateAddingMarkers) {
				this._animationAddLayer(layer, visibleLayer);
			} else {
				this._animationAddLayerNonAnimated(layer, visibleLayer);
			}
		}
		return this;
	},

	removeLayer: function (layer) {

		if (layer instanceof L.LayerGroup)
		{
			var array = [];
			for (var i in layer._layers) {
				array.push(layer._layers[i]);
			}
			return this.removeLayers(array);
		}

		//Non point layers
		if (!layer.getLatLng) {
			this._nonPointGroup.removeLayer(layer);
			return this;
		}

		if (!this._map) {
			if (!this._arraySplice(this._needsClustering, layer) && this.hasLayer(layer)) {
				this._needsRemoving.push(layer);
			}
			return this;
		}

		if (!layer.__parent) {
			return this;
		}

		if (this._unspiderfy) {
			this._unspiderfy();
			this._unspiderfyLayer(layer);
		}

		//Remove the marker from clusters
		this._removeLayer(layer, true);

		if (this._featureGroup.hasLayer(layer)) {
			this._featureGroup.removeLayer(layer);
			if (layer.setOpacity) {
				layer.setOpacity(1);
			}
		}

		return this;
	},

	//Takes an array of markers and adds them in bulk
	addLayers: function (layersArray) {
		var i, l, m,
			onMap = this._map,
			fg = this._featureGroup,
			npg = this._nonPointGroup;
console.log(layersArray.length);
		for (i = 0, l = layersArray.length; i < l; i++) {
			m = layersArray[i];

			//Not point data, can't be clustered
			if (!m.getLatLng) {
				npg.addLayer(m);
				continue;
			}

			if (this.hasLayer(m)) {
				continue;
			}

			if (!onMap) {
				this._needsClustering.push(m);
				continue;
			}

			this._addLayer(m, this._maxZoom);

			//If we just made a cluster of size 2 thern we need to remove the other marker fom the map (if it is) or we never will
			if (m.__parent) {
				if (m.__parent.getChildCount() === 2) {
					var markers = m.__parent.getAllChildMarkers(),
						otherMarker = markers[0] === m ? markers[1] : markers[0];
					fg.removeLayer(otherMarker);
				}
			}
		}
		// console.log(onMap);
		if (onMap) {
			//Update the icons of all those visible clusters that were affected
			fg.eachLayer(function (c) {				
				if (c instanceof L.MarkerCluster && c._iconNeedsUpdate) {
					c._updateIcon();
				}
			});
			this._topClusterLevel._recursivelyAddChildrenToMap(null, this._zoom, this._currentShownBounds);
		}
	// for(o in this._featureGroup._layers){
	// 	console.log(this._featureGroup._layers[o]._icon);
	// }


		return this;
	},

	//Takes an array of markers and removes them in bulk
	removeLayers: function (layersArray) {
		var i, l, m,
			fg = this._featureGroup,
			npg = this._nonPointGroup;

		if (!this._map) {
			for (i = 0, l = layersArray.length; i < l; i++) {
				m = layersArray[i];
				this._arraySplice(this._needsClustering, m);
				npg.removeLayer(m);
			}
			return this;
		}

		for (i = 0, l = layersArray.length; i < l; i++) {
			m = layersArray[i];

			if (!m.__parent) {
				npg.removeLayer(m);
				continue;
			}

			this._removeLayer(m, true, true);

			if (fg.hasLayer(m)) {
				fg.removeLayer(m);
				if (m.setOpacity) {
					m.setOpacity(1);
				}
			}
		}

		//Fix up the clusters and markers on the map
		this._topClusterLevel._recursivelyAddChildrenToMap(null, this._zoom, this._currentShownBounds);

		fg.eachLayer(function (c) {
			if (c instanceof L.MarkerCluster) {
				c._updateIcon();
			}
		});

		return this;
	},

	//Removes all layers from the MarkerClusterGroup
	clearLayers: function () {
		//Need our own special implementation as the LayerGroup one doesn't work for us

		//If we aren't on the map (yet), blow away the markers we know of
		if (!this._map) {
			this._needsClustering = [];
			delete this._gridClusters;
			delete this._gridUnclustered;
		}

		if (this._noanimationUnspiderfy) {
			this._noanimationUnspiderfy();
		}

		//Remove all the visible layers
		this._featureGroup.clearLayers();
		this._nonPointGroup.clearLayers();

		this.eachLayer(function (marker) {
			delete marker.__parent;
		});

		if (this._map) {
			//Reset _topClusterLevel and the DistanceGrids
			this._generateInitialClusters();
		}

		return this;
	},

	//Override FeatureGroup.getBounds as it doesn't work
	getBounds: function () {
		var bounds = new L.LatLngBounds();
		if (this._topClusterLevel) {
			bounds.extend(this._topClusterLevel._bounds);
		} else {
			for (var i = this._needsClustering.length - 1; i >= 0; i--) {
				bounds.extend(this._needsClustering[i].getLatLng());
			}
		}

		bounds.extend(this._nonPointGroup.getBounds());

		return bounds;
	},

	//Overrides LayerGroup.eachLayer
	eachLayer: function (method, context) {
		var markers = this._needsClustering.slice(),
		    i;

		if (this._topClusterLevel) {
			this._topClusterLevel.getAllChildMarkers(markers);
		}

		for (i = markers.length - 1; i >= 0; i--) {
			method.call(context, markers[i]);
		}

		this._nonPointGroup.eachLayer(method, context);
	},

	//Overrides LayerGroup.getLayers
	getLayers: function () {
		var layers = [];
		this.eachLayer(function (l) {
			layers.push(l);
		});
		return layers;
	},

	//Overrides LayerGroup.getLayer, WARNING: Really bad performance
	getLayer: function (id) {
		var result = null;

		this.eachLayer(function (l) {
			if (L.stamp(l) === id) {
				result = l;
			}
		});

		return result;
	},

	//Returns true if the given layer is in this MarkerClusterGroup
	hasLayer: function (layer) {
		if (!layer) {
			return false;
		}

		var i, anArray = this._needsClustering;

		for (i = anArray.length - 1; i >= 0; i--) {
			if (anArray[i] === layer) {
				return true;
			}
		}

		anArray = this._needsRemoving;
		for (i = anArray.length - 1; i >= 0; i--) {
			if (anArray[i] === layer) {
				return false;
			}
		}

		return !!(layer.__parent && layer.__parent._group === this) || this._nonPointGroup.hasLayer(layer);
	},

	//Zoom down to show the given layer (spiderfying if necessary) then calls the callback
	zoomToShowLayer: function (layer, callback) {

		var showMarker = function () {
			if ((layer._icon || layer.__parent._icon) && !this._inZoomAnimation) {
				this._map.off('moveend', showMarker, this);
				this.off('animationend', showMarker, this);

				if (layer._icon) {
					callback();
				} else if (layer.__parent._icon) {
					var afterSpiderfy = function () {
						this.off('spiderfied', afterSpiderfy, this);
						callback();
					};

					this.on('spiderfied', afterSpiderfy, this);
					layer.__parent.spiderfy();
				}
			}
		};

		if (layer._icon && this._map.getBounds().contains(layer.getLatLng())) {
			callback();
		} else if (layer.__parent._zoom < this._map.getZoom()) {
			//Layer should be visible now but isn't on screen, just pan over to it
			this._map.on('moveend', showMarker, this);
			this._map.panTo(layer.getLatLng());
		} else {
			this._map.on('moveend', showMarker, this);
			this.on('animationend', showMarker, this);
			this._map.setView(layer.getLatLng(), layer.__parent._zoom + 1);
			layer.__parent.zoomToBounds();
		}
	},

	//Overrides FeatureGroup.onAdd
	onAdd: function (map) {
		this._map = map;
		var i, l, layer;

		if (!isFinite(this._map.getMaxZoom())) {
			throw "Map has no maxZoom specified";
		}
// console.log('onAdd');
// console.log(this._map.getMaxZoom())
		this._featureGroup.onAdd(map);
		this._nonPointGroup.onAdd(map);

		if (!this._gridClusters) {
			this._generateInitialClusters();
		}

		for (i = 0, l = this._needsRemoving.length; i < l; i++) {
			layer = this._needsRemoving[i];
			this._removeLayer(layer, true);
		}
		this._needsRemoving = [];

		for (i = 0, l = this._needsClustering.length; i < l; i++) {
			layer = this._needsClustering[i];

			//If the layer doesn't have a getLatLng then we can't cluster it, so add it to our child featureGroup
			if (!layer.getLatLng) {
				this._featureGroup.addLayer(layer);
				continue;
			}

			if (layer.__parent) {
				continue;
			}
			this._addLayer(layer, this._maxZoom);
		}
		this._needsClustering = [];


		this._map.on('zoomend', this._zoomEnd, this);
		this._map.on('moveend', this._moveEnd, this);

		if (this._spiderfierOnAdd) { //TODO FIXME: Not sure how to have spiderfier add something on here nicely
			this._spiderfierOnAdd();
		}

		this._bindEvents();


		//Actually add our markers to the map:

		//Remember the current zoom level and bounds
		this._zoom = this._map.getZoom();
		this._currentShownBounds = this._getExpandedVisibleBounds();

		//Make things appear on the map
		this._topClusterLevel._recursivelyAddChildrenToMap(null, this._zoom, this._currentShownBounds);


	},

	//Overrides FeatureGroup.onRemove
	onRemove: function (map) {
		map.off('zoomend', this._zoomEnd, this);
		map.off('moveend', this._moveEnd, this);

		this._unbindEvents();

		//In case we are in a cluster animation
		this._map._mapPane.className = this._map._mapPane.className.replace(' leaflet-cluster-anim', '');

		if (this._spiderfierOnRemove) { //TODO FIXME: Not sure how to have spiderfier add something on here nicely
			this._spiderfierOnRemove();
		}



		//Clean up all the layers we added to the map
		this._hideCoverage();
		this._featureGroup.onRemove(map);
		this._nonPointGroup.onRemove(map);

		this._featureGroup.clearLayers();

		this._map = null;
	},

	getVisibleParent: function (marker) {
		var vMarker = marker;
		while (vMarker && !vMarker._icon) {
			vMarker = vMarker.__parent;
		}
		return vMarker || null;
	},

	//Remove the given object from the given array
	_arraySplice: function (anArray, obj) {
		for (var i = anArray.length - 1; i >= 0; i--) {
			if (anArray[i] === obj) {
				anArray.splice(i, 1);
				return true;
			}
		}
	},

	//Internal function for removing a marker from everything.
	//dontUpdateMap: set to true if you will handle updating the map manually (for bulk functions)
	_removeLayer: function (marker, removeFromDistanceGrid, dontUpdateMap) {
		var gridClusters = this._gridClusters,
			gridUnclustered = this._gridUnclustered,
			fg = this._featureGroup,
			map = this._map;

		//Remove the marker from distance clusters it might be in
		if (removeFromDistanceGrid) {
			for (var z = this._maxZoom; z >= 0; z--) {
				if (!gridUnclustered[z].removeObject(marker, map.project(marker.getLatLng(), z))) {
					break;
				}
			}
		}

		//Work our way up the clusters removing them as we go if required
		var cluster = marker.__parent,
			markers = cluster._markers,
			otherMarker;

		//Remove the marker from the immediate parents marker list
		this._arraySplice(markers, marker);

		while (cluster) {
			cluster._childCount--;

			if (cluster._zoom < 0) {
				//Top level, do nothing
				break;
			} else if (removeFromDistanceGrid && cluster._childCount <= 1) { //Cluster no longer required
				//We need to push the other marker up to the parent
				otherMarker = cluster._markers[0] === marker ? cluster._markers[1] : cluster._markers[0];

				//Update distance grid
				gridClusters[cluster._zoom].removeObject(cluster, map.project(cluster._cLatLng, cluster._zoom));
				gridUnclustered[cluster._zoom].addObject(otherMarker, map.project(otherMarker.getLatLng(), cluster._zoom));

				//Move otherMarker up to parent
				this._arraySplice(cluster.__parent._childClusters, cluster);
				cluster.__parent._markers.push(otherMarker);
				otherMarker.__parent = cluster.__parent;

				if (cluster._icon) {
					//Cluster is currently on the map, need to put the marker on the map instead
					fg.removeLayer(cluster);
					if (!dontUpdateMap) {
						fg.addLayer(otherMarker);
					}
				}
			} else {
				cluster._recalculateBounds();
				if (!dontUpdateMap || !cluster._icon) {
					cluster._updateIcon();
				}
			}

			cluster = cluster.__parent;
		}

		delete marker.__parent;
	},

	_isOrIsParent: function (el, oel) {
		while (oel) {
			if (el === oel) {
				return true;
			}
			oel = oel.parentNode;
		}
		return false;
	},

	_propagateEvent: function (e) {
		if (e.layer instanceof L.MarkerCluster) {
			//Prevent multiple clustermouseover/off events if the icon is made up of stacked divs (Doesn't work in ie <= 8, no relatedTarget)
			if (e.originalEvent && this._isOrIsParent(e.layer._icon, e.originalEvent.relatedTarget)) {
				return;
			}
			e.type = 'cluster' + e.type;
		}

		this.fire(e.type, e);
	},

	//Default functionality
	_defaultIconCreateFunction: function (cluster) {
		var childCount = cluster.getChildCount();

		var c = ' marker-cluster-';
		if (childCount < 10) {
			c += 'small';
		} else if (childCount < 100) {
			c += 'medium';
		} else {
			c += 'large';
		}

		return new L.DivIcon({ html: '<div><span>' + childCount + '</span></div>', className: 'marker-cluster' + c, iconSize: new L.Point(40, 40) });
	},

	_bindEvents: function () {
		var map = this._map,
		    spiderfyOnMaxZoom = this.options.spiderfyOnMaxZoom,
		    showCoverageOnHover = this.options.showCoverageOnHover,
		    zoomToBoundsOnClick = this.options.zoomToBoundsOnClick;

		//Zoom on cluster click or spiderfy if we are at the lowest level
		if (spiderfyOnMaxZoom || zoomToBoundsOnClick) {
			this.on('clusterclick', this._zoomOrSpiderfy, this);
		}

		//Show convex hull (boundary) polygon on mouse over
		if (showCoverageOnHover) {
			this.on('clustermouseover', this._showCoverage, this);
			this.on('clustermouseout', this._hideCoverage, this);
			map.on('zoomend', this._hideCoverage, this);
		}
	},

	_zoomOrSpiderfy: function (e) {
		var map = this._map;
		if (map.getMaxZoom() === map.getZoom()) {
			if (this.options.spiderfyOnMaxZoom) {
				e.layer.spiderfy();
			}
		} else if (this.options.zoomToBoundsOnClick) {
			e.layer.zoomToBounds();
		}

    // Focus the map again for keyboard users.
		if (e.originalEvent && e.originalEvent.keyCode === 13) {
			map._container.focus();
		}
	},

	_showCoverage: function (e) {
		var map = this._map;
		if (this._inZoomAnimation) {
			return;
		}
		if (this._shownPolygon) {
			map.removeLayer(this._shownPolygon);
		}
		if (e.layer.getChildCount() > 2 && e.layer !== this._spiderfied) {
			this._shownPolygon = new L.Polygon(e.layer.getConvexHull(), this.options.polygonOptions);
			map.addLayer(this._shownPolygon);
		}
	},

	_hideCoverage: function () {
		if (this._shownPolygon) {
			this._map.removeLayer(this._shownPolygon);
			this._shownPolygon = null;
		}
	},

	_unbindEvents: function () {
		var spiderfyOnMaxZoom = this.options.spiderfyOnMaxZoom,
			showCoverageOnHover = this.options.showCoverageOnHover,
			zoomToBoundsOnClick = this.options.zoomToBoundsOnClick,
			map = this._map;

		if (spiderfyOnMaxZoom || zoomToBoundsOnClick) {
			this.off('clusterclick', this._zoomOrSpiderfy, this);
		}
		if (showCoverageOnHover) {
			this.off('clustermouseover', this._showCoverage, this);
			this.off('clustermouseout', this._hideCoverage, this);
			map.off('zoomend', this._hideCoverage, this);
		}
	},

	_zoomEnd: function () {
		if (!this._map) { //May have been removed from the map by a zoomEnd handler
			return;
		}
		this._mergeSplitClusters();

		this._zoom = this._map._zoom;
		this._currentShownBounds = this._getExpandedVisibleBounds();
	},

	_moveEnd: function () {
		if (this._inZoomAnimation) {
			return;
		}

		var newBounds = this._getExpandedVisibleBounds();

		this._topClusterLevel._recursivelyRemoveChildrenFromMap(this._currentShownBounds, this._zoom, newBounds);
		this._topClusterLevel._recursivelyAddChildrenToMap(null, this._map._zoom, newBounds);

		this._currentShownBounds = newBounds;
		return;
	},

	_generateInitialClusters: function () {
		var maxZoom = this._map.getMaxZoom(),
			radius = this.options.maxClusterRadius;

		if (this.options.disableClusteringAtZoom) {
			maxZoom = this.options.disableClusteringAtZoom - 1;
		}
		this._maxZoom = maxZoom;
		this._gridClusters = {};
		this._gridUnclustered = {};

		//Set up DistanceGrids for each zoom
		for (var zoom = maxZoom; zoom >= 0; zoom--) {
			this._gridClusters[zoom] = new L.DistanceGrid(radius);
			this._gridUnclustered[zoom] = new L.DistanceGrid(radius);
		}

		this._topClusterLevel = new L.MarkerCluster(this, -1);
	},

	//Zoom: Zoom to start adding at (Pass this._maxZoom to start at the bottom)
	_addLayer: function (layer, zoom) {
		var gridClusters = this._gridClusters,
		    gridUnclustered = this._gridUnclustered,
		    markerPoint, z;

		if (this.options.singleMarkerMode) {
			layer.options.icon = this.options.iconCreateFunction({
				getChildCount: function () {
					return 1;
				},
				getAllChildMarkers: function () {
					return [layer];
				}
			});
		}
		// console.log(layer); console.log(zoom);
		// console.log(layer.options.icon.options.html);

		//Find the lowest zoom level to slot this one in
		for (; zoom >= 0; zoom--) {
			markerPoint = this._map.project(layer.getLatLng(), zoom); // calculate pixel position

			//Try find a cluster close by
			var closest = gridClusters[zoom].getNearObject(markerPoint);
			if (closest) {
				closest._addChild(layer);
				layer.__parent = closest;
				return;
			}

			//Try find a marker close by to form a new cluster with
			closest = gridUnclustered[zoom].getNearObject(markerPoint);
			if (closest) {
				var parent = closest.__parent;
				if (parent) {
					this._removeLayer(closest, false);
				}

				//Create new cluster with these 2 in it

				var newCluster = new L.MarkerCluster(this, zoom, closest, layer);
				gridClusters[zoom].addObject(newCluster, this._map.project(newCluster._cLatLng, zoom));
				closest.__parent = newCluster;
				layer.__parent = newCluster;

				//First create any new intermediate parent clusters that don't exist
				var lastParent = newCluster;
				for (z = zoom - 1; z > parent._zoom; z--) {
					lastParent = new L.MarkerCluster(this, z, lastParent);
					gridClusters[z].addObject(lastParent, this._map.project(closest.getLatLng(), z));
				}
				parent._addChild(lastParent);

				//Remove closest from this zoom level and any above that it is in, replace with newCluster
				for (z = zoom; z >= 0; z--) {
					if (!gridUnclustered[z].removeObject(closest, this._map.project(closest.getLatLng(), z))) {
						break;
					}
				}

				return;
			}

			//Didn't manage to cluster in at this zoom, record us as a marker here and continue upwards
			gridUnclustered[zoom].addObject(layer, markerPoint);
		}

		//Didn't get in anything, add us to the top
		this._topClusterLevel._addChild(layer);
		layer.__parent = this._topClusterLevel;
		return;
	},

	//Enqueue code to fire after the marker expand/contract has happened
	_enqueue: function (fn) {
		this._queue.push(fn);
		if (!this._queueTimeout) {
			this._queueTimeout = setTimeout(L.bind(this._processQueue, this), 300);
		}
	},
	_processQueue: function () {
		for (var i = 0; i < this._queue.length; i++) {
			this._queue[i].call(this);
		}
		this._queue.length = 0;
		clearTimeout(this._queueTimeout);
		this._queueTimeout = null;
	},

	//Merge and split any existing clusters that are too big or small
	_mergeSplitClusters: function () {

		//Incase we are starting to split before the animation finished
		this._processQueue();

		if (this._zoom < this._map._zoom && this._currentShownBounds.contains(this._getExpandedVisibleBounds())) { //Zoom in, split
			this._animationStart();
			//Remove clusters now off screen
			this._topClusterLevel._recursivelyRemoveChildrenFromMap(this._currentShownBounds, this._zoom, this._getExpandedVisibleBounds());

			this._animationZoomIn(this._zoom, this._map._zoom);

		} else if (this._zoom > this._map._zoom) { //Zoom out, merge
			this._animationStart();

			this._animationZoomOut(this._zoom, this._map._zoom);
		} else {
			this._moveEnd();
		}
	},

	//Gets the maps visible bounds expanded in each direction by the size of the screen (so the user cannot see an area we do not cover in one pan)
	_getExpandedVisibleBounds: function () {
		if (!this.options.removeOutsideVisibleBounds) {
			return this.getBounds();
		}

		var map = this._map,
			bounds = map.getBounds(),
			sw = bounds._southWest,
			ne = bounds._northEast,
			latDiff = L.Browser.mobile ? 0 : Math.abs(sw.lat - ne.lat),
			lngDiff = L.Browser.mobile ? 0 : Math.abs(sw.lng - ne.lng);

		return new L.LatLngBounds(
			new L.LatLng(sw.lat - latDiff, sw.lng - lngDiff, true),
			new L.LatLng(ne.lat + latDiff, ne.lng + lngDiff, true));
	},

	//Shared animation code
	_animationAddLayerNonAnimated: function (layer, newCluster) {
		if (newCluster === layer) {
			this._featureGroup.addLayer(layer);
		} else if (newCluster._childCount === 2) {
			newCluster._addToMap();

			var markers = newCluster.getAllChildMarkers();
			this._featureGroup.removeLayer(markers[0]);
			this._featureGroup.removeLayer(markers[1]);
		} else {
			newCluster._updateIcon();
		}
	}
});

L.MarkerClusterGroup.include(!L.DomUtil.TRANSITION ? {

	//Non Animated versions of everything
	_animationStart: function () {
		//Do nothing...
	},
	_animationZoomIn: function (previousZoomLevel, newZoomLevel) {
		this._topClusterLevel._recursivelyRemoveChildrenFromMap(this._currentShownBounds, previousZoomLevel);
		this._topClusterLevel._recursivelyAddChildrenToMap(null, newZoomLevel, this._getExpandedVisibleBounds());
	},
	_animationZoomOut: function (previousZoomLevel, newZoomLevel) {
		this._topClusterLevel._recursivelyRemoveChildrenFromMap(this._currentShownBounds, previousZoomLevel);
		this._topClusterLevel._recursivelyAddChildrenToMap(null, newZoomLevel, this._getExpandedVisibleBounds());
	},
	_animationAddLayer: function (layer, newCluster) {
		this._animationAddLayerNonAnimated(layer, newCluster);
	}
} : {

	//Animated versions here
	_animationStart: function () {
		this._map._mapPane.className += ' leaflet-cluster-anim';
		this._inZoomAnimation++;
	},
	_animationEnd: function () {
		if (this._map) {
			this._map._mapPane.className = this._map._mapPane.className.replace(' leaflet-cluster-anim', '');
		}
		this._inZoomAnimation--;
		this.fire('animationend');
	},
	_animationZoomIn: function (previousZoomLevel, newZoomLevel) {
		var bounds = this._getExpandedVisibleBounds(),
		    fg = this._featureGroup,
		    i;

		//Add all children of current clusters to map and remove those clusters from map
		this._topClusterLevel._recursively(bounds, previousZoomLevel, 0, function (c) {
			var startPos = c._latlng,
				markers = c._markers,
				m;

			if (!bounds.contains(startPos)) {
				startPos = null;
			}

			if (c._isSingleParent() && previousZoomLevel + 1 === newZoomLevel) { //Immediately add the new child and remove us
				fg.removeLayer(c);
				c._recursivelyAddChildrenToMap(null, newZoomLevel, bounds);
			} else {
				//Fade out old cluster
				c.setOpacity(0);
				c._recursivelyAddChildrenToMap(startPos, newZoomLevel, bounds);
			}

			//Remove all markers that aren't visible any more
			//TODO: Do we actually need to do this on the higher levels too?
			for (i = markers.length - 1; i >= 0; i--) {
				m = markers[i];
				if (!bounds.contains(m._latlng)) {
					fg.removeLayer(m);
				}
			}

		});

		this._forceLayout();

		//Update opacities
		this._topClusterLevel._recursivelyBecomeVisible(bounds, newZoomLevel);
		//TODO Maybe? Update markers in _recursivelyBecomeVisible
		fg.eachLayer(function (n) {
			if (!(n instanceof L.MarkerCluster) && n._icon) {
				n.setOpacity(1);
			}
		});

		//update the positions of the just added clusters/markers
		this._topClusterLevel._recursively(bounds, previousZoomLevel, newZoomLevel, function (c) {
			c._recursivelyRestoreChildPositions(newZoomLevel);
		});

		//Remove the old clusters and close the zoom animation
		this._enqueue(function () {
			//update the positions of the just added clusters/markers
			this._topClusterLevel._recursively(bounds, previousZoomLevel, 0, function (c) {
				fg.removeLayer(c);
				c.setOpacity(1);
			});

			this._animationEnd();
		});
	},

	_animationZoomOut: function (previousZoomLevel, newZoomLevel) {
		this._animationZoomOutSingle(this._topClusterLevel, previousZoomLevel - 1, newZoomLevel);

		//Need to add markers for those that weren't on the map before but are now
		this._topClusterLevel._recursivelyAddChildrenToMap(null, newZoomLevel, this._getExpandedVisibleBounds());
		//Remove markers that were on the map before but won't be now
		this._topClusterLevel._recursivelyRemoveChildrenFromMap(this._currentShownBounds, previousZoomLevel, this._getExpandedVisibleBounds());
	},
	_animationZoomOutSingle: function (cluster, previousZoomLevel, newZoomLevel) {
		var bounds = this._getExpandedVisibleBounds();

		//Animate all of the markers in the clusters to move to their cluster center point
		cluster._recursivelyAnimateChildrenInAndAddSelfToMap(bounds, previousZoomLevel + 1, newZoomLevel);

		var me = this;

		//Update the opacity (If we immediately set it they won't animate)
		this._forceLayout();
		cluster._recursivelyBecomeVisible(bounds, newZoomLevel);

		//TODO: Maybe use the transition timing stuff to make this more reliable
		//When the animations are done, tidy up
		this._enqueue(function () {

			//This cluster stopped being a cluster before the timeout fired
			if (cluster._childCount === 1) {
				var m = cluster._markers[0];
				//If we were in a cluster animation at the time then the opacity and position of our child could be wrong now, so fix it
				m.setLatLng(m.getLatLng());
				m.setOpacity(1);
			} else {
				cluster._recursively(bounds, newZoomLevel, 0, function (c) {
					c._recursivelyRemoveChildrenFromMap(bounds, previousZoomLevel + 1);
				});
			}
			me._animationEnd();
		});
	},
	_animationAddLayer: function (layer, newCluster) {
		var me = this,
			fg = this._featureGroup;

		fg.addLayer(layer);
		if (newCluster !== layer) {
			if (newCluster._childCount > 2) { //Was already a cluster

				newCluster._updateIcon();
				this._forceLayout();
				this._animationStart();

				layer._setPos(this._map.latLngToLayerPoint(newCluster.getLatLng()));
				layer.setOpacity(0);

				this._enqueue(function () {
					fg.removeLayer(layer);
					layer.setOpacity(1);

					me._animationEnd();
				});

			} else { //Just became a cluster
				this._forceLayout();

				me._animationStart();
				me._animationZoomOutSingle(newCluster, this._map.getMaxZoom(), this._map.getZoom());
			}
		}
	},

	//Force a browser layout of stuff in the map
	// Should apply the current opacity and location to all elements so we can update them again for an animation
	_forceLayout: function () {
		//In my testing this works, infact offsetWidth of any element seems to work.
		//Could loop all this._layers and do this for each _icon if it stops working

		L.Util.falseFn(document.body.offsetWidth);
	}
});

L.markerClusterGroup = function (options) {
	return new L.MarkerClusterGroup(options);
};


L.MarkerCluster = L.Marker.extend({
	initialize: function (group, zoom, a, b) {

		L.Marker.prototype.initialize.call(this, a ? (a._cLatLng || a.getLatLng()) : new L.LatLng(0, 0), { icon: this });


		this._group = group;
		this._zoom = zoom;

		this._markers = [];
		this._childClusters = [];
		this._childCount = 0;
		this._iconNeedsUpdate = true;

		this._bounds = new L.LatLngBounds();

		if (a) {
			this._addChild(a);
		}
		if (b) {
			this._addChild(b);
		}
	},

	//Recursively retrieve all child markers of this cluster
	getAllChildMarkers: function (storageArray) {
		storageArray = storageArray || [];

		for (var i = this._childClusters.length - 1; i >= 0; i--) {
			this._childClusters[i].getAllChildMarkers(storageArray);
		}

		for (var j = this._markers.length - 1; j >= 0; j--) {
			storageArray.push(this._markers[j]);
		}

		return storageArray;
	},

	//Returns the count of how many child markers we have
	getChildCount: function () {
		return this._childCount;
	},

	//Zoom to the minimum of showing all of the child markers, or the extents of this cluster
	zoomToBounds: function () {
		var childClusters = this._childClusters.slice(),
			map = this._group._map,
			boundsZoom = map.getBoundsZoom(this._bounds),
			zoom = this._zoom + 1,
			mapZoom = map.getZoom(),
			i;

		//calculate how fare we need to zoom down to see all of the markers
		while (childClusters.length > 0 && boundsZoom > zoom) {
			zoom++;
			var newClusters = [];
			for (i = 0; i < childClusters.length; i++) {
				newClusters = newClusters.concat(childClusters[i]._childClusters);
			}
			childClusters = newClusters;
		}

		if (boundsZoom > zoom) {
			this._group._map.setView(this._latlng, zoom);
		} else if (boundsZoom <= mapZoom) { //If fitBounds wouldn't zoom us down, zoom us down instead
			this._group._map.setView(this._latlng, mapZoom + 1);
		} else {
			this._group._map.fitBounds(this._bounds);
		}
	},

	getBounds: function () {
		var bounds = new L.LatLngBounds();
		bounds.extend(this._bounds);
		return bounds;
	},

	_updateIcon: function () {
		this._iconNeedsUpdate = true;
		if (this._icon) {
			this.setIcon(this);
		}
	},

	//Cludge for Icon, we pretend to be an icon for performance
	createIcon: function () {
		if (this._iconNeedsUpdate) {
			this._iconObj = this._group.options.iconCreateFunction(this);
			this._iconNeedsUpdate = false;
		}
		return this._iconObj.createIcon();
	},
	createShadow: function () {
		return this._iconObj.createShadow();
	},


	_addChild: function (new1, isNotificationFromChild) {

		this._iconNeedsUpdate = true;
		this._expandBounds(new1);

		if (new1 instanceof L.MarkerCluster) {
			if (!isNotificationFromChild) {
				this._childClusters.push(new1);
				new1.__parent = this;
			}
			this._childCount += new1._childCount;
		} else {
			if (!isNotificationFromChild) {
				this._markers.push(new1);
			}
			this._childCount++;
		}

		if (this.__parent) {
			this.__parent._addChild(new1, true);
		}
	},

	//Expand our bounds and tell our parent to
	_expandBounds: function (marker) {
		var addedCount,
		    addedLatLng = marker._wLatLng || marker._latlng;

		if (marker instanceof L.MarkerCluster) {
			this._bounds.extend(marker._bounds);
			addedCount = marker._childCount;
		} else {
			this._bounds.extend(addedLatLng);
			addedCount = 1;
		}

		if (!this._cLatLng) {
			// when clustering, take position of the first point as the cluster center
			this._cLatLng = marker._cLatLng || addedLatLng;
		}

		// when showing clusters, take weighted average of all points as cluster center
		var totalCount = this._childCount + addedCount;

		//Calculate weighted latlng for display
		if (!this._wLatLng) {
			this._latlng = this._wLatLng = new L.LatLng(addedLatLng.lat, addedLatLng.lng);
		} else {
			this._wLatLng.lat = (addedLatLng.lat * addedCount + this._wLatLng.lat * this._childCount) / totalCount;
			this._wLatLng.lng = (addedLatLng.lng * addedCount + this._wLatLng.lng * this._childCount) / totalCount;
		}
	},

	//Set our markers position as given and add it to the map
	_addToMap: function (startPos) {
		if (startPos) {
			this._backupLatlng = this._latlng;
			this.setLatLng(startPos);
		}
		this._group._featureGroup.addLayer(this);
	},

	_recursivelyAnimateChildrenIn: function (bounds, center, maxZoom) {
		this._recursively(bounds, 0, maxZoom - 1,
			function (c) {
				var markers = c._markers,
					i, m;
				for (i = markers.length - 1; i >= 0; i--) {
					m = markers[i];

					//Only do it if the icon is still on the map
					if (m._icon) {
						m._setPos(center);
						m.setOpacity(0);
					}
				}
			},
			function (c) {
				var childClusters = c._childClusters,
					j, cm;
				for (j = childClusters.length - 1; j >= 0; j--) {
					cm = childClusters[j];
					if (cm._icon) {
						cm._setPos(center);
						cm.setOpacity(0);
					}
				}
			}
		);
	},

	_recursivelyAnimateChildrenInAndAddSelfToMap: function (bounds, previousZoomLevel, newZoomLevel) {
		this._recursively(bounds, newZoomLevel, 0,
			function (c) {
				c._recursivelyAnimateChildrenIn(bounds, c._group._map.latLngToLayerPoint(c.getLatLng()).round(), previousZoomLevel);

				//TODO: depthToAnimateIn affects _isSingleParent, if there is a multizoom we may/may not be.
				//As a hack we only do a animation free zoom on a single level zoom, if someone does multiple levels then we always animate
				if (c._isSingleParent() && previousZoomLevel - 1 === newZoomLevel) {
					c.setOpacity(1);
					c._recursivelyRemoveChildrenFromMap(bounds, previousZoomLevel); //Immediately remove our children as we are replacing them. TODO previousBounds not bounds
				} else {
					c.setOpacity(0);
				}

				c._addToMap();
			}
		);
	},

	_recursivelyBecomeVisible: function (bounds, zoomLevel) {
		this._recursively(bounds, 0, zoomLevel, null, function (c) {
			c.setOpacity(1);
		});
	},

	_recursivelyAddChildrenToMap: function (startPos, zoomLevel, bounds) {
		this._recursively(bounds, -1, zoomLevel,
			function (c) {
				if (zoomLevel === c._zoom) {
					return;
				}

				//Add our child markers at startPos (so they can be animated out)
				for (var i = c._markers.length - 1; i >= 0; i--) {
					var nm = c._markers[i];

					if (!bounds.contains(nm._latlng)) {
						continue;
					}

					if (startPos) {
						nm._backupLatlng = nm.getLatLng();

						nm.setLatLng(startPos);
						if (nm.setOpacity) {
							nm.setOpacity(0);
						}
					}

					c._group._featureGroup.addLayer(nm);
				}
			},
			function (c) {
				c._addToMap(startPos);
			}
		);
	},

	_recursivelyRestoreChildPositions: function (zoomLevel) {
		//Fix positions of child markers
		for (var i = this._markers.length - 1; i >= 0; i--) {
			var nm = this._markers[i];
			if (nm._backupLatlng) {
				nm.setLatLng(nm._backupLatlng);
				delete nm._backupLatlng;
			}
		}

		if (zoomLevel - 1 === this._zoom) {
			//Reposition child clusters
			for (var j = this._childClusters.length - 1; j >= 0; j--) {
				this._childClusters[j]._restorePosition();
			}
		} else {
			for (var k = this._childClusters.length - 1; k >= 0; k--) {
				this._childClusters[k]._recursivelyRestoreChildPositions(zoomLevel);
			}
		}
	},

	_restorePosition: function () {
		if (this._backupLatlng) {
			this.setLatLng(this._backupLatlng);
			delete this._backupLatlng;
		}
	},

	//exceptBounds: If set, don't remove any markers/clusters in it
	_recursivelyRemoveChildrenFromMap: function (previousBounds, zoomLevel, exceptBounds) {
		var m, i;
		this._recursively(previousBounds, -1, zoomLevel - 1,
			function (c) {
				//Remove markers at every level
				for (i = c._markers.length - 1; i >= 0; i--) {
					m = c._markers[i];
					if (!exceptBounds || !exceptBounds.contains(m._latlng)) {
						c._group._featureGroup.removeLayer(m);
						if (m.setOpacity) {
							m.setOpacity(1);
						}
					}
				}
			},
			function (c) {
				//Remove child clusters at just the bottom level
				for (i = c._childClusters.length - 1; i >= 0; i--) {
					m = c._childClusters[i];
					if (!exceptBounds || !exceptBounds.contains(m._latlng)) {
						c._group._featureGroup.removeLayer(m);
						if (m.setOpacity) {
							m.setOpacity(1);
						}
					}
				}
			}
		);
	},

	//Run the given functions recursively to this and child clusters
	// boundsToApplyTo: a L.LatLngBounds representing the bounds of what clusters to recurse in to
	// zoomLevelToStart: zoom level to start running functions (inclusive)
	// zoomLevelToStop: zoom level to stop running functions (inclusive)
	// runAtEveryLevel: function that takes an L.MarkerCluster as an argument that should be applied on every level
	// runAtBottomLevel: function that takes an L.MarkerCluster as an argument that should be applied at only the bottom level
	_recursively: function (boundsToApplyTo, zoomLevelToStart, zoomLevelToStop, runAtEveryLevel, runAtBottomLevel) {
		var childClusters = this._childClusters,
		    zoom = this._zoom,
			i, c;

		if (zoomLevelToStart > zoom) { //Still going down to required depth, just recurse to child clusters
			for (i = childClusters.length - 1; i >= 0; i--) {
				c = childClusters[i];
				if (boundsToApplyTo.intersects(c._bounds)) {
					c._recursively(boundsToApplyTo, zoomLevelToStart, zoomLevelToStop, runAtEveryLevel, runAtBottomLevel);
				}
			}
		} else { //In required depth

			if (runAtEveryLevel) {
				runAtEveryLevel(this);
			}
			if (runAtBottomLevel && this._zoom === zoomLevelToStop) {
				runAtBottomLevel(this);
			}

			//TODO: This loop is almost the same as above
			if (zoomLevelToStop > zoom) {
				for (i = childClusters.length - 1; i >= 0; i--) {
					c = childClusters[i];
					if (boundsToApplyTo.intersects(c._bounds)) {
						c._recursively(boundsToApplyTo, zoomLevelToStart, zoomLevelToStop, runAtEveryLevel, runAtBottomLevel);
					}
				}
			}
		}
	},

	_recalculateBounds: function () {
		var markers = this._markers,
			childClusters = this._childClusters,
			i;

		this._bounds = new L.LatLngBounds();
		delete this._wLatLng;

		for (i = markers.length - 1; i >= 0; i--) {
			this._expandBounds(markers[i]);
		}
		for (i = childClusters.length - 1; i >= 0; i--) {
			this._expandBounds(childClusters[i]);
		}
	},


	//Returns true if we are the parent of only one cluster and that cluster is the same as us
	_isSingleParent: function () {
		//Don't need to check this._markers as the rest won't work if there are any
		return this._childClusters.length > 0 && this._childClusters[0]._childCount === this._childCount;
	}
});



L.DistanceGrid = function (cellSize) {
	this._cellSize = cellSize;
	this._sqCellSize = cellSize * cellSize;
	this._grid = {};
	this._objectPoint = { };
};

L.DistanceGrid.prototype = {

	addObject: function (obj, point) {
		var x = this._getCoord(point.x),
		    y = this._getCoord(point.y),
		    grid = this._grid,
		    row = grid[y] = grid[y] || {},
		    cell = row[x] = row[x] || [],
		    stamp = L.Util.stamp(obj);

		this._objectPoint[stamp] = point;

		cell.push(obj);
	},

	updateObject: function (obj, point) {
		this.removeObject(obj);
		this.addObject(obj, point);
	},

	//Returns true if the object was found
	removeObject: function (obj, point) {
		var x = this._getCoord(point.x),
		    y = this._getCoord(point.y),
		    grid = this._grid,
		    row = grid[y] = grid[y] || {},
		    cell = row[x] = row[x] || [],
		    i, len;

		delete this._objectPoint[L.Util.stamp(obj)];

		for (i = 0, len = cell.length; i < len; i++) {
			if (cell[i] === obj) {

				cell.splice(i, 1);

				if (len === 1) {
					delete row[x];
				}

				return true;
			}
		}

	},

	eachObject: function (fn, context) {
		var i, j, k, len, row, cell, removed,
		    grid = this._grid;

		for (i in grid) {
			row = grid[i];

			for (j in row) {
				cell = row[j];

				for (k = 0, len = cell.length; k < len; k++) {
					removed = fn.call(context, cell[k]);
					if (removed) {
						k--;
						len--;
					}
				}
			}
		}
	},

	getNearObject: function (point) {
		var x = this._getCoord(point.x),
		    y = this._getCoord(point.y),
		    i, j, k, row, cell, len, obj, dist,
		    objectPoint = this._objectPoint,
		    closestDistSq = this._sqCellSize,
		    closest = null;

		for (i = y - 1; i <= y + 1; i++) {
			row = this._grid[i];
			if (row) {

				for (j = x - 1; j <= x + 1; j++) {
					cell = row[j];
					if (cell) {

						for (k = 0, len = cell.length; k < len; k++) {
							obj = cell[k];
							dist = this._sqDist(objectPoint[L.Util.stamp(obj)], point);
							if (dist < closestDistSq) {
								closestDistSq = dist;
								closest = obj;
							}
						}
					}
				}
			}
		}
		return closest;
	},

	_getCoord: function (x) {
		return Math.floor(x / this._cellSize);
	},

	_sqDist: function (p, p2) {
		var dx = p2.x - p.x,
		    dy = p2.y - p.y;
		return dx * dx + dy * dy;
	}
};


/* Copyright (c) 2012 the authors listed at the following URL, and/or
the authors of referenced articles or incorporated external code:
http://en.literateprograms.org/Quickhull_(Javascript)?action=history&offset=20120410175256

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Retrieved from: http://en.literateprograms.org/Quickhull_(Javascript)?oldid=18434
*/

(function () {
	L.QuickHull = {

		/*
		 * @param {Object} cpt a point to be measured from the baseline
		 * @param {Array} bl the baseline, as represented by a two-element
		 *   array of latlng objects.
		 * @returns {Number} an approximate distance measure
		 */
		getDistant: function (cpt, bl) {
			var vY = bl[1].lat - bl[0].lat,
				vX = bl[0].lng - bl[1].lng;
			return (vX * (cpt.lat - bl[0].lat) + vY * (cpt.lng - bl[0].lng));
		},

		/*
		 * @param {Array} baseLine a two-element array of latlng objects
		 *   representing the baseline to project from
		 * @param {Array} latLngs an array of latlng objects
		 * @returns {Object} the maximum point and all new points to stay
		 *   in consideration for the hull.
		 */
		findMostDistantPointFromBaseLine: function (baseLine, latLngs) {
			var maxD = 0,
				maxPt = null,
				newPoints = [],
				i, pt, d;

			for (i = latLngs.length - 1; i >= 0; i--) {
				pt = latLngs[i];
				d = this.getDistant(pt, baseLine);

				if (d > 0) {
					newPoints.push(pt);
				} else {
					continue;
				}

				if (d > maxD) {
					maxD = d;
					maxPt = pt;
				}
			}

			return { maxPoint: maxPt, newPoints: newPoints };
		},


		/*
		 * Given a baseline, compute the convex hull of latLngs as an array
		 * of latLngs.
		 *
		 * @param {Array} latLngs
		 * @returns {Array}
		 */
		buildConvexHull: function (baseLine, latLngs) {
			var convexHullBaseLines = [],
				t = this.findMostDistantPointFromBaseLine(baseLine, latLngs);

			if (t.maxPoint) { // if there is still a point "outside" the base line
				convexHullBaseLines =
					convexHullBaseLines.concat(
						this.buildConvexHull([baseLine[0], t.maxPoint], t.newPoints)
					);
				convexHullBaseLines =
					convexHullBaseLines.concat(
						this.buildConvexHull([t.maxPoint, baseLine[1]], t.newPoints)
					);
				return convexHullBaseLines;
			} else {  // if there is no more point "outside" the base line, the current base line is part of the convex hull
				return [baseLine[0]];
			}
		},

		/*
		 * Given an array of latlngs, compute a convex hull as an array
		 * of latlngs
		 *
		 * @param {Array} latLngs
		 * @returns {Array}
		 */
		getConvexHull: function (latLngs) {
			// find first baseline
			var maxLat = false, minLat = false,
				maxPt = null, minPt = null,
				i;

			for (i = latLngs.length - 1; i >= 0; i--) {
				var pt = latLngs[i];
				if (maxLat === false || pt.lat > maxLat) {
					maxPt = pt;
					maxLat = pt.lat;
				}
				if (minLat === false || pt.lat < minLat) {
					minPt = pt;
					minLat = pt.lat;
				}
			}
			var ch = [].concat(this.buildConvexHull([minPt, maxPt], latLngs),
								this.buildConvexHull([maxPt, minPt], latLngs));
			return ch;
		}
	};
}());

L.MarkerCluster.include({
	getConvexHull: function () {
		var childMarkers = this.getAllChildMarkers(),
			points = [],
			p, i;

		for (i = childMarkers.length - 1; i >= 0; i--) {
			p = childMarkers[i].getLatLng();
			points.push(p);
		}

		return L.QuickHull.getConvexHull(points);
	}
});


//This code is 100% based on https://github.com/jawj/OverlappingMarkerSpiderfier-Leaflet
//Huge thanks to jawj for implementing it first to make my job easy :-)

L.MarkerCluster.include({

	_2PI: Math.PI * 2,
	_circleFootSeparation: 25, //related to circumference of circle
	_circleStartAngle: Math.PI / 6,

	_spiralFootSeparation:  28, //related to size of spiral (experiment!)
	_spiralLengthStart: 11,
	_spiralLengthFactor: 5,

	_circleSpiralSwitchover: 9, //show spiral instead of circle from this marker count upwards.
								// 0 -> always spiral; Infinity -> always circle

	spiderfy: function () {
		if (this._group._spiderfied === this || this._group._inZoomAnimation) {
			return;
		}

		var childMarkers = this.getAllChildMarkers(),
			group = this._group,
			map = group._map,
			center = map.latLngToLayerPoint(this._latlng),
			positions;

		this._group._unspiderfy();
		this._group._spiderfied = this;

		//TODO Maybe: childMarkers order by distance to center

		if (childMarkers.length >= this._circleSpiralSwitchover) {
			positions = this._generatePointsSpiral(childMarkers.length, center);
		} else {
			center.y += 10; //Otherwise circles look wrong
			positions = this._generatePointsCircle(childMarkers.length, center);
		}

		this._animationSpiderfy(childMarkers, positions);
	},

	unspiderfy: function (zoomDetails) {
		/// <param Name="zoomDetails">Argument from zoomanim if being called in a zoom animation or null otherwise</param>
		if (this._group._inZoomAnimation) {
			return;
		}
		this._animationUnspiderfy(zoomDetails);

		this._group._spiderfied = null;
	},

	_generatePointsCircle: function (count, centerPt) {
		var circumference = this._group.options.spiderfyDistanceMultiplier * this._circleFootSeparation * (2 + count),
			legLength = circumference / this._2PI,  //radius from circumference
			angleStep = this._2PI / count,
			res = [],
			i, angle;

		res.length = count;

		for (i = count - 1; i >= 0; i--) {
			angle = this._circleStartAngle + i * angleStep;
			res[i] = new L.Point(centerPt.x + legLength * Math.cos(angle), centerPt.y + legLength * Math.sin(angle))._round();
		}

		return res;
	},

	_generatePointsSpiral: function (count, centerPt) {
		var legLength = this._group.options.spiderfyDistanceMultiplier * this._spiralLengthStart,
			separation = this._group.options.spiderfyDistanceMultiplier * this._spiralFootSeparation,
			lengthFactor = this._group.options.spiderfyDistanceMultiplier * this._spiralLengthFactor,
			angle = 0,
			res = [],
			i;

		res.length = count;

		for (i = count - 1; i >= 0; i--) {
			angle += separation / legLength + i * 0.0005;
			res[i] = new L.Point(centerPt.x + legLength * Math.cos(angle), centerPt.y + legLength * Math.sin(angle))._round();
			legLength += this._2PI * lengthFactor / angle;
		}
		return res;
	},

	_noanimationUnspiderfy: function () {
		var group = this._group,
			map = group._map,
			fg = group._featureGroup,
			childMarkers = this.getAllChildMarkers(),
			m, i;

		this.setOpacity(1);
		for (i = childMarkers.length - 1; i >= 0; i--) {
			m = childMarkers[i];

			fg.removeLayer(m);

			if (m._preSpiderfyLatlng) {
				m.setLatLng(m._preSpiderfyLatlng);
				delete m._preSpiderfyLatlng;
			}
			if (m.setZIndexOffset) {
				m.setZIndexOffset(0);
			}

			if (m._spiderLeg) {
				map.removeLayer(m._spiderLeg);
				delete m._spiderLeg;
			}
		}

		group._spiderfied = null;
	}
});

L.MarkerCluster.include(!L.DomUtil.TRANSITION ? {
	//Non Animated versions of everything
	_animationSpiderfy: function (childMarkers, positions) {
		var group = this._group,
			map = group._map,
			fg = group._featureGroup,
			i, m, leg, newPos;

		for (i = childMarkers.length - 1; i >= 0; i--) {
			newPos = map.layerPointToLatLng(positions[i]);
			m = childMarkers[i];

			m._preSpiderfyLatlng = m._latlng;
			m.setLatLng(newPos);
			if (m.setZIndexOffset) {
				m.setZIndexOffset(1000000); //Make these appear on top of EVERYTHING
			}

			fg.addLayer(m);


			leg = new L.Polyline([this._latlng, newPos], { weight: 1.5, color: '#222' });
			map.addLayer(leg);
			m._spiderLeg = leg;
		}
		this.setOpacity(0.3);
		group.fire('spiderfied');
	},

	_animationUnspiderfy: function () {
		this._noanimationUnspiderfy();
	}
} : {
	//Animated versions here
	SVG_ANIMATION: (function () {
		return document.createElementNS('http://www.w3.org/2000/svg', 'animate').toString().indexOf('SVGAnimate') > -1;
	}()),

	_animationSpiderfy: function (childMarkers, positions) {
		var me = this,
			group = this._group,
			map = group._map,
			fg = group._featureGroup,
			thisLayerPos = map.latLngToLayerPoint(this._latlng),
			i, m, leg, newPos;

		//Add markers to map hidden at our center point
		for (i = childMarkers.length - 1; i >= 0; i--) {
			m = childMarkers[i];

			//If it is a marker, add it now and we'll animate it out
			if (m.setOpacity) {
				m.setZIndexOffset(1000000); //Make these appear on top of EVERYTHING
				m.setOpacity(0);
			
				fg.addLayer(m);

				m._setPos(thisLayerPos);
			} else {
				//Vectors just get immediately added
				fg.addLayer(m);
			}
		}

		group._forceLayout();
		group._animationStart();

		var initialLegOpacity = L.Path.SVG ? 0 : 0.3,
			xmlns = L.Path.SVG_NS;


		for (i = childMarkers.length - 1; i >= 0; i--) {
			newPos = map.layerPointToLatLng(positions[i]);
			m = childMarkers[i];

			//Move marker to new position
			m._preSpiderfyLatlng = m._latlng;
			m.setLatLng(newPos);
			
			if (m.setOpacity) {
				m.setOpacity(1);
			}


			//Add Legs.
			leg = new L.Polyline([me._latlng, newPos], { weight: 1.5, color: '#222', opacity: initialLegOpacity });
			map.addLayer(leg);
			m._spiderLeg = leg;

			//Following animations don't work for canvas
			if (!L.Path.SVG || !this.SVG_ANIMATION) {
				continue;
			}

			//How this works:
			//http://stackoverflow.com/questions/5924238/how-do-you-animate-an-svg-path-in-ios
			//http://dev.opera.com/articles/view/advanced-svg-animation-techniques/

			//Animate length
			var length = leg._path.getTotalLength();
			leg._path.setAttribute("stroke-dasharray", length + "," + length);

			var anim = document.createElementNS(xmlns, "animate");
			anim.setAttribute("attributeName", "stroke-dashoffset");
			anim.setAttribute("begin", "indefinite");
			anim.setAttribute("from", length);
			anim.setAttribute("to", 0);
			anim.setAttribute("dur", 0.25);
			leg._path.appendChild(anim);
			anim.beginElement();

			//Animate opacity
			anim = document.createElementNS(xmlns, "animate");
			anim.setAttribute("attributeName", "stroke-opacity");
			anim.setAttribute("attributeName", "stroke-opacity");
			anim.setAttribute("begin", "indefinite");
			anim.setAttribute("from", 0);
			anim.setAttribute("to", 0.5);
			anim.setAttribute("dur", 0.25);
			leg._path.appendChild(anim);
			anim.beginElement();
		}
		me.setOpacity(0.3);

		//Set the opacity of the spiderLegs back to their correct value
		// The animations above override this until they complete.
		// If the initial opacity of the spiderlegs isn't 0 then they appear before the animation starts.
		if (L.Path.SVG) {
			this._group._forceLayout();

			for (i = childMarkers.length - 1; i >= 0; i--) {
				m = childMarkers[i]._spiderLeg;

				m.options.opacity = 0.5;
				m._path.setAttribute('stroke-opacity', 0.5);
			}
		}

		setTimeout(function () {
			group._animationEnd();
			group.fire('spiderfied');
		}, 200);
	},

	_animationUnspiderfy: function (zoomDetails) {
		var group = this._group,
			map = group._map,
			fg = group._featureGroup,
			thisLayerPos = zoomDetails ? map._latLngToNewLayerPoint(this._latlng, zoomDetails.zoom, zoomDetails.center) : map.latLngToLayerPoint(this._latlng),
			childMarkers = this.getAllChildMarkers(),
			svg = L.Path.SVG && this.SVG_ANIMATION,
			m, i, a;

		group._animationStart();

		//Make us visible and bring the child markers back in
		this.setOpacity(1);
		for (i = childMarkers.length - 1; i >= 0; i--) {
			m = childMarkers[i];

			//Marker was added to us after we were spidified
			if (!m._preSpiderfyLatlng) {
				continue;
			}

			//Fix up the location to the real one
			m.setLatLng(m._preSpiderfyLatlng);
			delete m._preSpiderfyLatlng;
			//Hack override the location to be our center
			if (m.setOpacity) {
				m._setPos(thisLayerPos);
				m.setOpacity(0);
			} else {
				fg.removeLayer(m);
			}

			//Animate the spider legs back in
			if (svg) {
				a = m._spiderLeg._path.childNodes[0];
				a.setAttribute('to', a.getAttribute('from'));
				a.setAttribute('from', 0);
				a.beginElement();

				a = m._spiderLeg._path.childNodes[1];
				a.setAttribute('from', 0.5);
				a.setAttribute('to', 0);
				a.setAttribute('stroke-opacity', 0);
				a.beginElement();

				m._spiderLeg._path.setAttribute('stroke-opacity', 0);
			}
		}

		setTimeout(function () {
			//If we have only <= one child left then that marker will be shown on the map so don't remove it!
			var stillThereChildCount = 0;
			for (i = childMarkers.length - 1; i >= 0; i--) {
				m = childMarkers[i];
				if (m._spiderLeg) {
					stillThereChildCount++;
				}
			}


			for (i = childMarkers.length - 1; i >= 0; i--) {
				m = childMarkers[i];

				if (!m._spiderLeg) { //Has already been unspiderfied
					continue;
				}


				if (m.setOpacity) {
					m.setOpacity(1);
					m.setZIndexOffset(0);
				}

				if (stillThereChildCount > 1) {
					fg.removeLayer(m);
				}

				map.removeLayer(m._spiderLeg);
				delete m._spiderLeg;
			}
			group._animationEnd();
		}, 200);
	}
});


L.MarkerClusterGroup.include({
	//The MarkerCluster currently spiderfied (if any)
	_spiderfied: null,

	_spiderfierOnAdd: function () {
		this._map.on('click', this._unspiderfyWrapper, this);

		if (this._map.options.zoomAnimation) {
			this._map.on('zoomstart', this._unspiderfyZoomStart, this);
		}
		//Browsers without zoomAnimation or a big zoom don't fire zoomstart
		this._map.on('zoomend', this._noanimationUnspiderfy, this);

		if (L.Path.SVG && !L.Browser.touch) {
			this._map._initPathRoot();
			//Needs to happen in the pageload, not after, or animations don't work in webkit
			//  http://stackoverflow.com/questions/8455200/svg-animate-with-dynamically-added-elements
			//Disable on touch browsers as the animation messes up on a touch zoom and isn't very noticable
		}
	},

	_spiderfierOnRemove: function () {
		this._map.off('click', this._unspiderfyWrapper, this);
		this._map.off('zoomstart', this._unspiderfyZoomStart, this);
		this._map.off('zoomanim', this._unspiderfyZoomAnim, this);

		this._unspiderfy(); //Ensure that markers are back where they should be
	},


	//On zoom start we add a zoomanim handler so that we are guaranteed to be last (after markers are animated)
	//This means we can define the animation they do rather than Markers doing an animation to their actual location
	_unspiderfyZoomStart: function () {
		if (!this._map) { //May have been removed from the map by a zoomEnd handler
			return;
		}

		this._map.on('zoomanim', this._unspiderfyZoomAnim, this);
	},
	_unspiderfyZoomAnim: function (zoomDetails) {
		//Wait until the first zoomanim after the user has finished touch-zooming before running the animation
		if (L.DomUtil.hasClass(this._map._mapPane, 'leaflet-touching')) {
			return;
		}

		this._map.off('zoomanim', this._unspiderfyZoomAnim, this);
		this._unspiderfy(zoomDetails);
	},


	_unspiderfyWrapper: function () {
		/// <summary>_unspiderfy but passes no arguments</summary>
		this._unspiderfy();
	},

	_unspiderfy: function (zoomDetails) {
		if (this._spiderfied) {
			this._spiderfied.unspiderfy(zoomDetails);
		}
	},

	_noanimationUnspiderfy: function () {
		if (this._spiderfied) {
			this._spiderfied._noanimationUnspiderfy();
		}
	},

	//If the given layer is currently being spiderfied then we unspiderfy it so it isn't on the map anymore etc
	_unspiderfyLayer: function (layer) {
		if (layer._spiderLeg) {
			this._featureGroup.removeLayer(layer);

			layer.setOpacity(1);
			//Position will be fixed up immediately in _animationUnspiderfy
			layer.setZIndexOffset(0);

			this._map.removeLayer(layer._spiderLeg);
			delete layer._spiderLeg;
		}
	}
});


}(window, document));;/*! leaflet-d3.js Version: 0.3.8 */
(function(){
	"use strict";

	// L is defined by the Leaflet library, see git://github.com/Leaflet/Leaflet.git for documentation
	L.HexbinLayer = L.Class.extend({
		includes: [L.Mixin.Events],

		options : {
			radius : 10,
			opacity: 0.5,
			duration: 200,
			lng: function(d){
				return d[0];
			},
			lat: function(d){
				return d[1];
			},
			value: function(d){
				return d.length;
			},
			valueFloor: undefined,
			valueCeil: undefined,
			colorRange: ['#f7fbff', '#08306b'],

			onmouseover: undefined,
			onmouseout: undefined,
			click: undefined
		},

		initialize : function(options) {
			L.setOptions(this, options);

			this._hexLayout = d3.hexbin()
				.radius(this.options.radius)
				.x(function(d){ return d.point[0]; })
				.y(function(d){ return d.point[1]; });

			this._data = [];
			this._colorScale = d3.scale.linear()
				.range(this.options.colorRange)
				.clamp(true);

		},

		onAdd : function(map) {
			this._map = map;

			// Create a container for svg.
			this._container = this._initContainer();

			// Set up events
			map.on({'moveend': this._redraw}, this);

			// Initial draw
			this._redraw();
		},

		onRemove : function(map) {
			this._destroyContainer();

			// Remove events
			map.off({'moveend': this._redraw}, this);

			this._container = null;
			this._map = null;

			// Explicitly will leave the data array alone in case the layer will be shown again
			//this._data = [];
		},

		addTo : function(map) {
			map.addLayer(this);
			return this;
		},

		_initContainer : function() {
			var container = null;

			// If the container is null or the overlay pane is empty, create the svg element for drawing
			if (null == this._container) {
				var overlayPane = this._map.getPanes().overlayPane;
				container = d3.select(overlayPane).append('svg')
					.attr('class', 'leaflet-layer leaflet-zoom-hide');
			}

			return container;
		},

		_destroyContainer: function(){
			// Remove the svg element
			if(null != this._container){
				this._container.remove();
			}
		},

		// (Re)draws the hexbin group
		_redraw : function(){
			var that = this;

			if (!that._map) {
				return;
			}

			// Generate the mapped version of the data
			var data = that._data.map(function(d) {
				var lng = that.options.lng(d);
				var lat = that.options.lat(d);

				var point = that._project([lng, lat]);
				return { o: d, point: point };
			});

			var zoom = this._map.getZoom();

			// Determine the bounds from the data and scale the overlay
			var padding = this.options.radius * 2;
			var bounds = this._getBounds(data);
			var width = (bounds.max[0] - bounds.min[0]) + (2 * padding),
				height = (bounds.max[1] - bounds.min[1]) + (2 * padding),
				marginTop = bounds.min[1] - padding,
				marginLeft = bounds.min[0] - padding;

			this._hexLayout.size([ width, height ]);
			this._container
				.attr('width', width).attr('height', height)
				.style('margin-left', marginLeft + 'px')
				.style('margin-top', marginTop + 'px');

			// Select the hex group for the current zoom level. This has 
			// the effect of recreating the group if the zoom level has changed
			var join = this._container.selectAll('g.hexbin')
				.data([zoom], function(d){ return d; });

			// enter
			join.enter().append('g')
				.attr('class', function(d) { return 'hexbin zoom-' + d; });

			// enter + update
			join.attr('transform', 'translate(' + -marginLeft + ',' + -marginTop + ')');

			// exit
			join.exit().remove();

			// add the hexagons to the select
			this._createHexagons(join, data);

		},

		_createHexagons : function(g, data) {
			var that = this;

			// Create the bins using the hexbin layout
			var bins = that._hexLayout(data);

			// Determine the extent of the values
			var extent = d3.extent(bins, function(d){
				return that.options.value(d);
			});
			if(null == extent[0]) extent[0] = 0;
			if(null == extent[1]) extent[1] = 0;
			if(null != that.options.valueFloor) extent[0] = that.options.valueFloor;
			if(null != that.options.valueCeil) extent[1] = that.options.valueCeil;

			// Match the domain cardinality to that of the color range, to allow for a polylinear scale
			var domain = that._linearlySpace(extent[0], extent[1], that._colorScale.range().length);

			// Set the colorscale domain
			that._colorScale.domain(domain);

			// Join - Join the Hexagons to the data
			var join = g.selectAll('path.hexbin-hexagon')
				.data(bins, function(d){ return d.i + ':' + d.j; });

			// Update - set the fill and opacity on a transition (opacity is re-applied in case the enter transition was cancelled)
			join.transition().duration(that.options.duration)
				.attr('fill', function(d){ return that._colorScale(that.options.value(d)); })
				.attr('fill-opacity', that.options.opacity)
				.attr('stroke-opacity', that.options.opacity);
	
			// Enter - establish the path, the fill, and the initial opacity
			join.enter().append('path').attr('class', 'hexbin-hexagon')
				.attr('d', function(d){ return 'M' + d.x + ',' + d.y + that._hexLayout.hexagon(); })
				.attr('fill', function(d){ return that._colorScale(that.options.value(d)); })
				.attr('fill-opacity', 0.01)
				.attr('stroke', '#ffffff')
				.attr('stroke-width', 1)
				// .attr('stroke-opacity', 1)
				.on('mouseover', function(d, i) {
					if(null != that.options.onmouseover) {
						that.options.onmouseover(d, this, that);
					}
				})
				.on('mouseout', function(d, i) {
					if(null != that.options.onmouseout) {
						that.options.onmouseout(d, this, that);
					}
				})
				.on('click', function(d, i) {
					if(null != that.options.onclick) {
						that.options.onclick(d, this, that);
					}
				})
				.transition().duration(that.options.duration)
					.attr('fill-opacity', that.options.opacity)
					.attr('stroke-opacity', that.options.opacity);

			// Exit
			join.exit().transition().duration(that.options.duration)
				.attr('fill-opacity', 0.01)
				.attr('stroke-opacity', 0.01)
				.remove();

		},

		_project : function(coord) {
			var point = this._map.latLngToLayerPoint([ coord[1], coord[0] ]);
			return [ point.x, point.y ];
		},

		_getBounds: function(data){
			var that = this;

			if(null == data || data.length < 1){
				return { min: [0,0], max: [0,0]};
			}

			// bounds is [[min long, min lat], [max long, max lat]]
			var bounds = [[999, 999], [-999, -999]];

			data.forEach(function(element){
				var x = element.point[0];
				var y = element.point[1];

				bounds[0][0] = Math.min(bounds[0][0], x);
				bounds[0][1] = Math.min(bounds[0][1], y);
				bounds[1][0] = Math.max(bounds[1][0], x);
				bounds[1][1] = Math.max(bounds[1][1], y);
			});

			return { min: bounds[0], max: bounds[1] };
		},

		_linearlySpace: function(from, to, length){
			var arr = new Array(length);
			var step = (to - from) / Math.max(length - 1, 1);

			for (var i = 0; i < length; ++i) {
				arr[i] = from + (i * step);
			}

			return arr;
		},

		/* 
		 * Setter for the data
		 */
		data : function(data) {
			this._data = (null != data)? data : [];
			this._redraw();
			return this;
		},

		/*
		 * Getter/setter for the colorScale
		 */
		colorScale: function(colorScale) {
			if(undefined === colorScale){
				return this._colorScale;
			}

			this._colorScale = colorScale;
			this._redraw();
			return this;
		},

		/*
		 * Getter/Setter for the value function
		 */
		value: function(valueFn) {
			if(undefined === valueFn){
				return this.options.value;
			}

			this.options.value = valueFn;
			this._redraw();
			return this;
		},

		/*
		 * Getter/setter for the mouseover function
		 */
		onmouseover: function(mouseoverFn) {
			this.options.onmouseover = mouseoverFn;
			this._redraw();
			return this;
		},

		/*
		 * Getter/setter for the mouseout function
		 */
		onmouseout: function(mouseoutFn) {
			this.options.onmouseout = mouseoutFn;
			this._redraw();
			return this;
		},

		/*
		 * Getter/setter for the click function
		 */
		onclick: function(clickFn) {
			this.options.onclick = clickFn;
			this._redraw();
			return this;
		}

	});

	L.hexbinLayer = function(options) {
		return new L.HexbinLayer(options);
	};

})();

(function(){
	"use strict";

	// L is defined by the Leaflet library, see git://github.com/Leaflet/Leaflet.git for documentation
	L.PingLayer = L.Class.extend({
		includes: [L.Mixin.Events],

		/*
		 * Configuration
		 */
		options : {
			lng: function(d){
				return d[0];
			},
			lat: function(d){
				return d[1];
			},
			fps: 32,
			duration: 800
		},

		_lastUpdate: Date.now(),
		_fps: 0,

		_mapBounds: undefined,

		/*
		 * Public Methods
		 */

		/*
		 * Getter/setter for the radius
		 */
		radiusScale: function(radiusScale) {
			if(undefined === radiusScale){
				return this._radiusScale;
			}

			this._radiusScale = radiusScale;
			return this;
		},

		/*
		 * Getter/setter for the opacity
		 */
		opacityScale: function(opacityScale) {
			if(undefined === opacityScale){
				return this._opacityScale;
			}

			this._opacityScale = opacityScale;
			return this;
		},

		// Initialization of the plugin
		initialize : function(options) {
			L.setOptions(this, options);

			this._radiusScale = d3.scale.pow().exponent(0.35)
				.domain([0, this.options.duration])
				.range([3, 15])
				.clamp(true);
			this._opacityScale = d3.scale.linear()
				.domain([0, this.options.duration])
				.range([1, 0])
				.clamp(true);
		},

		// Called when the plugin layer is added to the map
		onAdd : function(map) {
			this._map = map;

			// Init the state of the simulation
			this._running = false;

			// Create a container for svg.
			this._container = this._initContainer();
			this._updateContainer();

			// Set up events
			map.on({'move': this._move}, this);
		},

		// Called when the plugin layer is removed from the map
		onRemove : function(map) {
			this._destroyContainer();

			// Remove events
			map.off({'move': this._move}, this);

			this._container = null;
			this._map = null;
			this._data = null;
		},

		// Add the layer to the map
		addTo : function(map) {
			map.addLayer(this);
			return this;
		},

		/*
		 * Method by which to "add" pings
		 */
		ping : function(data, cssClass) {
			this._add(data, cssClass);
			this._expire();

			// Start timer if not active
			if(!this._running && this._data.length > 0) {
				this._running = true;
				this._lastUpdate = Date.now();

				var that = this;
				d3.timer(function() { return that._update.apply(that); });
			}

			return this;
		},

		getFps : function() {
			return this._fps;
		},

		getCount : function() {
			return this._data.length;
		},

		/*
		 * Private Methods
		 */

		// Initialize the Container - creates the svg pane
		_initContainer : function() {
			var container = null;

			// If the container is null or the overlay pane is empty, create the svg element for drawing
			if (null == this._container) {
				var overlayPane = this._map.getPanes().overlayPane;
				container = d3.select(overlayPane).append('svg')
					.attr('class', 'leaflet-layer leaflet-zoom-hide');
			}

			return container;
		},

		// Update the container - Updates the dimensions of the svg pane
		_updateContainer : function() {
			var bounds = this._getMapBounds();
			this._mapBounds = bounds;

			this._container
				.attr('width', bounds.width).attr('height', bounds.height)
				.style('margin-left', bounds.left + 'px')
				.style('margin-top', bounds.top + 'px');
		},

		// Cleanup the svg pane
		_destroyContainer: function() {
			// Remove the svg element
			if(null != this._container){
				this._container.remove();
			}
		},

		// Calculate the current map bounds
		_getMapBounds: function(){
			var latLongBounds = this._map.getBounds();
			var ne = this._map.latLngToLayerPoint(latLongBounds.getNorthEast());
			var sw = this._map.latLngToLayerPoint(latLongBounds.getSouthWest());

			var bounds = {
				width: ne.x - sw.x,
				height: sw.y - ne.y,
				left: sw.x,
				top: ne.y
			};

			return bounds;
		},

		// Update the map based on zoom/pan/move
		_move: function() {
			this._updateContainer();
		},

		// Add a ping to the map
		_add : function(data, cssClass) {
			// Lazy init the data array
			if(null == this._data) this._data = [];

			// Derive the spatial data
			var geo = [this.options.lat(data), this.options.lng(data)];
			var point = this._map.latLngToLayerPoint(geo);
			var mapBounds = this._mapBounds;

			// Add the data to the list of pings
			var circle = {
				geo: geo,
				x: point.x - mapBounds.left, y: point.y - mapBounds.top,
				ts: Date.now(),
				nts: 0
			};
			circle.c = this._container.append('circle')
				.attr('class', (null != cssClass)? 'ping ' + cssClass : 'ping')
				.attr('cx', circle.x)
				.attr('cy', circle.y)
				.attr('r', this.radiusScale().range()[0]);

			// Push new circles
			this._data.push(circle);
		},

		// Main update loop
		_update : function() {
			var nowTs = Date.now();
			if(null == this._data) this._data = [];

			var maxIndex = -1;

			// Update everything
			for(var i=0; i < this._data.length; i++) {
				var d = this._data[i];
				var age = nowTs - d.ts;

				if(this.options.duration < age){
					// If the blip is beyond it's life, remove it from the dom and track the lowest index to remove
					d.c.remove();
					maxIndex = i;
				} else {

					// If the blip is still alive, process it
					if(d.nts < nowTs) {
						d.c.attr('r', this.radiusScale()(age))
						   .attr('fill-opacity', this.opacityScale()(age))
						   .attr('stroke-opacity', this.opacityScale()(age));
						d.nts = Math.round(nowTs + 1000/this.options.fps);
					}
				}
			}

			// Delete all the aged off data at once
			if(maxIndex > -1) {
				this._data.splice(0, maxIndex + 1);
			}

			// The return function dictates whether the timer loop will continue
			this._running = (this._data.length > 0);

			if(this._running) {
				this._fps = 1000/(nowTs - this._lastUpdate);
				this._lastUpdate = nowTs;
			}

			return !this._running;
		},

		// Expire old pings
		_expire : function() {
			var maxIndex = -1;
			var nowTs = Date.now();

			// Search from the front of the array
			for(var i=0; i < this._data.length; i++) {
				var d = this._data[i];
				var age = nowTs - d.ts;

				if(this.options.duration < age) {
					// If the blip is beyond it's life, remove it from the dom and track the lowest index to remove
					d.c.remove();
					maxIndex = i;
				} else {
					break;
				}
			}

			// Delete all the aged off data at once
			if(maxIndex > -1) {
				this._data.splice(0, maxIndex + 1);
			}
		}

	});

	L.pingLayer = function(options) {
		return new L.PingLayer(options);
	};

})();;(function(){
  $(window).scroll(function () {
      var top = $(document).scrollTop();
      $('.splash').css({
        'background-position': '0px -'+(top/3).toFixed(2)+'px'
      });
      if(top > 50)
        $('#home > .navbar').removeClass('navbar-transparent');
      else
        $('#home > .navbar').addClass('navbar-transparent');
  });

  $("a[href='#']").click(function(e) {
    e.preventDefault();
  });

  var $button = $("<div id='source-button' class='btn btn-primary btn-xs'>&lt; &gt;</div>").click(function(){
    var html = $(this).parent().html();
    html = cleanSource(html);
    $("#source-modal pre").text(html);
    $("#source-modal").modal();
  });

  $('.bs-component [data-toggle="popover"]').popover();
  $('.bs-component [data-toggle="tooltip"]').tooltip();

  $(".bs-component").hover(function(){
    $(this).append($button);
    $button.show();
  }, function(){
    $button.hide();
  });

  function cleanSource(html) {
    var lines = html.split(/\n/);

    lines.shift();
    lines.splice(-1, 1);

    var indentSize = lines[0].length - lines[0].trim().length,
        re = new RegExp(" {" + indentSize + "}");

    lines = lines.map(function(line){
      if (line.match(re)) {
        line = line.substring(indentSize);
      }

      return line;
    });

    lines = lines.join("\n");

    return lines;
  }

})();

;/*
 * heatmap.js v2.0.0 | JavaScript Heatmap Library
 *
 * Copyright 2008-2014 Patrick Wied <heatmapjs@patrick-wied.at> - All rights reserved.
 * Dual licensed under MIT and Beerware license 
 *
 * :: 2014-09-04 17:52
 */
;(function(global){ 
// Heatmap Config stores default values and will be merged with instance config
var HeatmapConfig = {
  defaultRadius: 40,
  defaultRenderer: 'canvas2d',
  defaultGradient: { 0.25: "rgb(0,0,255)", 0.55: "rgb(0,255,0)", 0.85: "yellow", 1.0: "rgb(255,0,0)"},
  defaultMaxOpacity: 1,
  defaultMinOpacity: 0,
  defaultBlur: .85,
  defaultXField: 'x',
  defaultYField: 'y',
  defaultValueField: 'value', 
  plugins: {}
};
var Store = (function StoreClosure() {

  var Store = function Store(config) {
    this._coordinator = {};
    this._data = [];
    this._radi = [];
    this._min = 0;
    this._max = 1;
    this._xField = config['xField'] || config.defaultXField;
    this._yField = config['yField'] || config.defaultYField;
    this._valueField = config['valueField'] || config.defaultValueField;

    if (config["radius"]) {
      this._cfgRadius = config["radius"];
    }
  };

  var defaultRadius = HeatmapConfig.defaultRadius;

  Store.prototype = {
    // when forceRender = false -> called from setData, omits renderall event
    _organiseData: function(dataPoint, forceRender) {
        var x = dataPoint[this._xField];
        var y = dataPoint[this._yField];
        var radi = this._radi;
        var store = this._data;
        var max = this._max;
        var min = this._min;
        var value = dataPoint[this._valueField] || 1;
        var radius = dataPoint.radius || this._cfgRadius || defaultRadius;

        if (!store[x]) {
          store[x] = [];
          radi[x] = [];
        }

        if (!store[x][y]) {
          store[x][y] = value;
          radi[x][y] = radius;
        } else {
          store[x][y] += value;
        }

        if (store[x][y] > max) {
          if (!forceRender) {
            this._max = store[x][y];
          } else {
            this.setDataMax(store[x][y]);
          }
          return false;
        } else{
          return { 
            x: x, 
            y: y,
            value: value, 
            radius: radius,
            min: min,
            max: max 
          };
        }
    },
    _unOrganizeData: function() {
      var unorganizedData = [];
      var data = this._data;
      var radi = this._radi;

      for (var x in data) {
        for (var y in data[x]) {

          unorganizedData.push({
            x: x,
            y: y,
            radius: radi[x][y],
            value: data[x][y]
          });

        }
      }
      return {
        min: this._min,
        max: this._max,
        data: unorganizedData
      };
    },
    _onExtremaChange: function() {
      this._coordinator.emit('extremachange', {
        min: this._min,
        max: this._max
      });
    },
    addData: function() {
      if (arguments[0].length > 0) {
        var dataArr = arguments[0];
        var dataLen = dataArr.length;
        while (dataLen--) {
          this.addData.call(this, dataArr[dataLen]);
        }
      } else {
        // add to store  
        var organisedEntry = this._organiseData(arguments[0], true);
        if (organisedEntry) {
          this._coordinator.emit('renderpartial', {
            min: this._min,
            max: this._max,
            data: [organisedEntry]
          });
        }
      }
      return this;
    },
    setData: function(data) {
      var dataPoints = data.data;
      var pointsLen = dataPoints.length;


      // reset data arrays
      this._data = [];
      this._radi = [];

      for(var i = 0; i < pointsLen; i++) {
        this._organiseData(dataPoints[i], false);
      }
      this._max = data.max;
      this._min = data.min || 0;
      
      this._onExtremaChange();
      this._coordinator.emit('renderall', this._getInternalData());
      return this;
    },
    removeData: function() {
      // TODO: implement
    },
    setDataMax: function(max) {
      this._max = max;
      this._onExtremaChange();
      this._coordinator.emit('renderall', this._getInternalData());
      return this;
    },
    setDataMin: function(min) {
      this._min = min;
      this._onExtremaChange();
      this._coordinator.emit('renderall', this._getInternalData());
      return this;
    },
    setCoordinator: function(coordinator) {
      this._coordinator = coordinator;
    },
    _getInternalData: function() {
      return { 
        max: this._max,
        min: this._min, 
        data: this._data,
        radi: this._radi 
      };
    },
    getData: function() {
      return this._unOrganizeData();
    }/*,
      TODO: rethink.
    getValueAt: function(point) {
      var value;
      var radius = 100;
      var x = point.x;
      var y = point.y;
      var data = this._data;
      if (data[x] && data[x][y]) {
        return data[x][y];
      } else {
        var values = [];
        // radial search for datapoints based on default radius
        for(var distance = 1; distance < radius; distance++) {
          var neighbors = distance * 2 +1;
          var startX = x - distance;
          var startY = y - distance;
          for(var i = 0; i < neighbors; i++) {
            for (var o = 0; o < neighbors; o++) {
              if ((i == 0 || i == neighbors-1) || (o == 0 || o == neighbors-1)) {
                if (data[startY+i] && data[startY+i][startX+o]) {
                  values.push(data[startY+i][startX+o]);
                }
              } else {
                continue;
              } 
            }
          }
        }
        if (values.length > 0) {
          return Math.max.apply(Math, values);
        }
      }
      return false;
    }*/
  };


  return Store;
})();

var Canvas2dRenderer = (function Canvas2dRendererClosure() {
  
  var _getColorPalette = function(config) {
    var gradientConfig = config.gradient || config.defaultGradient;
    var paletteCanvas = document.createElement('canvas');
    var paletteCtx = paletteCanvas.getContext('2d');

    paletteCanvas.width = 256;
    paletteCanvas.height = 1;

    var gradient = paletteCtx.createLinearGradient(0, 0, 256, 1);
    for (var key in gradientConfig) {
      gradient.addColorStop(key, gradientConfig[key]);
    }

    paletteCtx.fillStyle = gradient;
    paletteCtx.fillRect(0, 0, 256, 1);

    return paletteCtx.getImageData(0, 0, 256, 1).data;
  };

  var _getPointTemplate = function(radius, blurFactor) {
    var tplCanvas = document.createElement('canvas');
    var tplCtx = tplCanvas.getContext('2d');
    var x = radius;
    var y = radius;
    tplCanvas.width = tplCanvas.height = radius*2;

    if (blurFactor == 1) {
      tplCtx.beginPath();
      tplCtx.arc(x, y, radius, 0, 2 * Math.PI, false);
      tplCtx.fillStyle = 'rgba(0,0,0,1)';
      tplCtx.fill();
    } else {
      var gradient = tplCtx.createRadialGradient(x, y, radius*blurFactor, x, y, radius);
      gradient.addColorStop(0, 'rgba(0,0,0,1)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      tplCtx.fillStyle = gradient;
      tplCtx.fillRect(0, 0, 2*radius, 2*radius);
    }
    
    

    return tplCanvas;
  };

  var _prepareData = function(data) {
    var renderData = [];
    var min = data.min;
    var max = data.max;
    var radi = data.radi;
    var data = data.data;
    
    var xValues = Object.keys(data);
    var xValuesLen = xValues.length;

    while(xValuesLen--) {
      var xValue = xValues[xValuesLen];
      var yValues = Object.keys(data[xValue]);
      var yValuesLen = yValues.length;
      while(yValuesLen--) {
        var yValue = yValues[yValuesLen];
        var value = data[xValue][yValue];
        var radius = radi[xValue][yValue];
        renderData.push({
          x: xValue,
          y: yValue,
          value: value,
          radius: radius
        });
      }
    }

    return {
      min: min,
      max: max,
      data: renderData
    };
  };


  function Canvas2dRenderer(config) {
    var container = config.container;
    var shadowCanvas = this.shadowCanvas = document.createElement('canvas');
    var canvas = this.canvas = config.canvas || document.createElement('canvas');
    var renderBoundaries = this._renderBoundaries = [10000, 10000, 0, 0];

    var computed = getComputedStyle(config.container) || {};

    canvas.className = 'heatmap-canvas';

    this._width = canvas.width = shadowCanvas.width = +(computed.width.replace(/px/,''));
    this._height = canvas.height = shadowCanvas.height = +(computed.height.replace(/px/,''));

    this.shadowCtx = shadowCanvas.getContext('2d');
    this.ctx = canvas.getContext('2d');

    // @TODO:
    // conditional wrapper

    canvas.style.cssText = shadowCanvas.style.cssText = 'position:absolute;left:0;top:0;';

    container.style.position = 'relative';
    container.appendChild(canvas);

    this._palette = _getColorPalette(config);
    this._templates = {};

    this._setStyles(config);
  };

  Canvas2dRenderer.prototype = {
    renderPartial: function(data) {
      this._drawAlpha(data);
      this._colorize();
    },
    renderAll: function(data) {
      // reset render boundaries
      this._clear();
      this._drawAlpha(_prepareData(data));
      this._colorize();
    },
    _updateGradient: function(config) {
      this._palette = _getColorPalette(config);
    },
    updateConfig: function(config) {
      if (config['gradient']) {
        this._updateGradient(config);
      }
      this._setStyles(config);
    },
    setDimensions: function(width, height) {
      this._width = width;
      this._height = height;
      this.canvas.width = this.shadowCanvas.width = width;
      this.canvas.height = this.shadowCanvas.height = height;
    },
    _clear: function() {
      this.shadowCtx.clearRect(0, 0, this._width, this._height);
      this.ctx.clearRect(0, 0, this._width, this._height);
    },
    _setStyles: function(config) {
      this._blur = (config.blur == 0)?0:(config.blur || config.defaultBlur);

      if (config.backgroundColor) {
        this.canvas.style.backgroundColor = config.backgroundColor;
      }

      this._opacity = (config.opacity || 0) * 255;
      this._maxOpacity = (config.maxOpacity || config.defaultMaxOpacity) * 255;
      this._minOpacity = (config.minOpacity || config.defaultMinOpacity) * 255;
      this._useGradientOpacity = !!config.useGradientOpacity;
    },
    _drawAlpha: function(data) {
      var min = this._min = data.min;
      var max = this._max = data.max;
      var data = data.data || [];
      var dataLen = data.length;
      // on a point basis?
      var blur = 1 - this._blur;

      while(dataLen--) {

        var point = data[dataLen];

        var x = point.x;
        var y = point.y;
        var radius = point.radius;
        // if value is bigger than max
        // use max as value
        var value = Math.min(point.value, max);
        var rectX = x - radius;
        var rectY = y - radius;
        var shadowCtx = this.shadowCtx;




        var tpl;
        if (!this._templates[radius]) {
          this._templates[radius] = tpl = _getPointTemplate(radius, blur);
        } else {
          tpl = this._templates[radius];
        }
        // value from minimum / value range
        // => [0, 1]
        shadowCtx.globalAlpha = (value-min)/(max-min);

        shadowCtx.drawImage(tpl, rectX, rectY);

        // update renderBoundaries
        if (rectX < this._renderBoundaries[0]) {
            this._renderBoundaries[0] = rectX;
          } 
          if (rectY < this._renderBoundaries[1]) {
            this._renderBoundaries[1] = rectY;
          }
          if (rectX + 2*radius > this._renderBoundaries[2]) {
            this._renderBoundaries[2] = rectX + 2*radius;
          }
          if (rectY + 2*radius > this._renderBoundaries[3]) {
            this._renderBoundaries[3] = rectY + 2*radius;
          }

      }
    },
    _colorize: function() {
      var x = this._renderBoundaries[0];
      var y = this._renderBoundaries[1];
      var width = this._renderBoundaries[2] - x;
      var height = this._renderBoundaries[3] - y;
      var maxWidth = this._width;
      var maxHeight = this._height;
      var opacity = this._opacity;
      var maxOpacity = this._maxOpacity;
      var minOpacity = this._minOpacity;
      var useGradientOpacity = this._useGradientOpacity;

      if (x < 0) {
        x = 0;
      }
      if (y < 0) {
        y = 0;
      }
      if (x + width > maxWidth) {
        width = maxWidth - x;
      }
      if (y + height > maxHeight) {
        height = maxHeight - y;
      }

      var img = this.shadowCtx.getImageData(x, y, width, height);
      var imgData = img.data;
      var len = imgData.length;
      var palette = this._palette;


      for (var i = 3; i < len; i+= 4) {
        var alpha = imgData[i];
        var offset = alpha * 4;


        if (!offset) {
          continue;
        }

        var finalAlpha;
        if (opacity > 0) {
          finalAlpha = opacity;
        } else {
          if (alpha < maxOpacity) {
            if (alpha < minOpacity) {
              finalAlpha = minOpacity;
            } else {
              finalAlpha = alpha;
            }
          } else {
            finalAlpha = maxOpacity;
          }
        }

        imgData[i-3] = palette[offset];
        imgData[i-2] = palette[offset + 1];
        imgData[i-1] = palette[offset + 2];
        imgData[i] = useGradientOpacity ? palette[offset + 3] : finalAlpha;

      }

      img.data = imgData;
      this.ctx.putImageData(img, x, y);

      this._renderBoundaries = [1000, 1000, 0, 0];

    },
    getValueAt: function(point) {
      var value;
      var shadowCtx = this.shadowCtx;
      var img = shadowCtx.getImageData(point.x, point.y, 1, 1);
      var data = img.data[3];
      var max = this._max;
      var min = this._min;

      value = (Math.abs(max-min) * (data/255)) >> 0;

      return value;
    },
    getDataURL: function() {
      return this.canvas.toDataURL();
    }
  };


  return Canvas2dRenderer;
})();

var Renderer = (function RendererClosure() {

  var rendererFn = false;

  if (HeatmapConfig['defaultRenderer'] === 'canvas2d') {
    rendererFn = Canvas2dRenderer;
  }

  return rendererFn;
})();


var Util = {
  merge: function() {
    var merged = {};
    var argsLen = arguments.length;
    for (var i = 0; i < argsLen; i++) {
      var obj = arguments[i]
      for (var key in obj) {
        merged[key] = obj[key];
      }
    }
    return merged;
  }
};
// Heatmap Constructor
var Heatmap = (function HeatmapClosure() {

  var Coordinator = (function CoordinatorClosure() {

    function Coordinator() {
      this.cStore = {};
    };

    Coordinator.prototype = {
      on: function(evtName, callback, scope) {
        var cStore = this.cStore;

        if (!cStore[evtName]) {
          cStore[evtName] = [];
        }
        cStore[evtName].push((function(data) {
            return callback.call(scope, data);
        }));
      },
      emit: function(evtName, data) {
        var cStore = this.cStore;
        if (cStore[evtName]) {
          var len = cStore[evtName].length;
          for (var i=0; i<len; i++) {
            var callback = cStore[evtName][i];
            callback(data);
          }
        }
      }
    };

    return Coordinator;
  })();


  var _connect = function(scope) {
    var renderer = scope._renderer;
    var coordinator = scope._coordinator;
    var store = scope._store;

    coordinator.on('renderpartial', renderer.renderPartial, renderer);
    coordinator.on('renderall', renderer.renderAll, renderer);
    coordinator.on('extremachange', function(data) {
      scope._config.onExtremaChange &&
      scope._config.onExtremaChange({
        min: data.min,
        max: data.max,
        gradient: scope._config['gradient'] || scope._config['defaultGradient']
      });
    });
    store.setCoordinator(coordinator);
  };


  function Heatmap() {
    var config = this._config = Util.merge(HeatmapConfig, arguments[0] || {});
    this._coordinator = new Coordinator();
    if (config['plugin']) {
      var pluginToLoad = config['plugin'];
      if (!HeatmapConfig.plugins[pluginToLoad]) {
        throw new Error('Plugin \''+ pluginToLoad + '\' not found. Maybe it was not registered.');
      } else {
        var plugin = HeatmapConfig.plugins[pluginToLoad];
        // set plugin renderer and store
        this._renderer = new plugin.renderer(config);
        this._store = new plugin.store(config);
      }
    } else {
      this._renderer = new Renderer(config);
      this._store = new Store(config);
    }
    _connect(this);
  };

  // @TODO:
  // add API documentation
  Heatmap.prototype = {
    addData: function() {
      this._store.addData.apply(this._store, arguments);
      return this;
    },
    removeData: function() {
      this._store.removeData && this._store.removeData.apply(this._store, arguments);
      return this;
    },
    setData: function() {
      this._store.setData.apply(this._store, arguments);
      return this;
    },
    setDataMax: function() {
      this._store.setDataMax.apply(this._store, arguments);
      return this;
    },
    setDataMin: function() {
      this._store.setDataMin.apply(this._store, arguments);
      return this;
    },
    configure: function(config) {
      this._config = Util.merge(this._config, config);
      this._renderer.updateConfig(this._config);
      this._coordinator.emit('renderall', this._store._getInternalData());
      return this;
    },
    repaint: function() {
      this._coordinator.emit('renderall', this._store._getInternalData());
      return this;
    },
    getData: function() {
      return this._store.getData();
    },
    getDataURL: function() {
      return this._renderer.getDataURL();
    },
    getValueAt: function(point) {

      if (this._store.getValueAt) {
        return this._store.getValueAt(point);
      } else  if (this._renderer.getValueAt) {
        return this._renderer.getValueAt(point);
      } else {
        return null;
      }
    }
  };

  return Heatmap;

})();


// core
var heatmapFactory = {
  create: function(config) {
    return new Heatmap(config);
  },
  register: function(pluginKey, plugin) {
    HeatmapConfig.plugins[pluginKey] = plugin;
  }
};

global['h337'] = heatmapFactory;

})(this || window);;/*
* Leaflet Heatmap Overlay
*
* Copyright (c) 2014, Patrick Wied (http://www.patrick-wied.at)
* Dual-licensed under the MIT (http://www.opensource.org/licenses/mit-license.php)
* and the Beerware (http://en.wikipedia.org/wiki/Beerware) license.
*/

var HeatmapOverlay = L.Class.extend({

  initialize: function (config) {
    this.cfg = config;
    this._el = L.DomUtil.create('div', 'leaflet-zoom-hide');
    this._data = [];
    this._max = 1;
    this.cfg.container = this._el;
  },

  onAdd: function (map) {
    var size = map.getSize();

    this._map = map;

    this._width = size.x;
    this._height = size.y;

    this._el.style.width = size.x + 'px';
    this._el.style.height = size.y + 'px';

    this._resetOrigin();

    map.getPanes().overlayPane.appendChild(this._el);

    if (!this._heatmap) {
      this._heatmap = h337.create(this.cfg);
    } 

    // on zoom, reset origin
    map.on('viewreset', this._resetOrigin, this);
    // redraw whenever dragend
    map.on('dragend', this._draw, this);

    this._draw();
  },

  onRemove: function (map) {
    // remove layer's DOM elements and listeners
    map.getPanes().overlayPane.removeChild(this._el);

    map.off('viewreset', this._resetOrigin, this);
    map.off('dragend', this._draw, this);
  },
  _draw: function() {
    if (!this._map) { return; }
    
    var point = this._map.latLngToContainerPoint(this._origin);        

    // reposition the layer
    this._el.style[HeatmapOverlay.CSS_TRANSFORM] = 'translate(' +
      -Math.round(point.x) + 'px,' +
      -Math.round(point.y) + 'px)';

    this._update();
  },
  _update: function() {
    var bounds, zoom, scale;

    bounds = this._map.getBounds();
    zoom = this._map.getZoom();
    scale = Math.pow(2, zoom);

    if (this._data.length == 0) {
      return;
    }

    var generatedData = { max: this._max };
    var latLngPoints = [];
    var radiusMultiplier = this.cfg.scaleRadius ? scale : 1;
    var localMax = 0;
    var valueField = this.cfg.valueField;
    var len = this._data.length;
  
    while (len--) {
      var entry = this._data[len];
      var value = entry[valueField];
      var latlng = entry.latlng;


      // we don't wanna render points that are not even on the map ;-)
      if (!bounds.contains(latlng)) {
        continue;
      }
      // local max is the maximum within current bounds
      if (value > localMax) {
        localMax = value;
      }

      var point = this._map.latLngToContainerPoint(latlng);
      var latlngPoint = { x: Math.round(point.x), y: Math.round(point.y) };
      latlngPoint[valueField] = value;

      var radius;

      if (entry.radius) {
        radius = entry.radius * radiusMultiplier;
      } else {
        radius = (this.cfg.radius || 2) * radiusMultiplier;
      }
      latlngPoint.radius = radius;
      latLngPoints.push(latlngPoint);
    }
    if (this.cfg.useLocalExtrema) {
      generatedData.max = localMax;
    }

    generatedData.data = latLngPoints;

    this._heatmap.setData(generatedData);
  },
  setData: function(data) {
    this._max = data.max || this._max;
    var latField = this.cfg.latField || 'lat';
    var lngField = this.cfg.lngField || 'lng';
    var valueField = this.cfg.valueField || 'value';
  
    // transform data to latlngs
    var data = data.data;
    var len = data.length;
    var d = [];
  
    while (len--) {
      var entry = data[len];
      var latlng = new L.LatLng(entry[latField], entry[lngField]);
      var dataObj = { latlng: latlng };
      dataObj[valueField] = entry[valueField];
      if (entry.radius) {
        dataObj.radius = entry.radius;
      }
      d.push(dataObj);
    }
    this._data = d;
  
    this._draw();
  },
  // experimential... not ready.
  addData: function(pointOrArray) {
    if (pointOrArray.length > 0) {
      var len = pointOrArray.length;
      while(len--) {
        this.addData(pointOrArray[len]);
      }
    } else {
      var latField = this.cfg.latField || 'lat';
      var lngField = this.cfg.lngField || 'lng';
      var valueField = this.cfg.valueField || 'value';
      var entry = pointOrArray;
      var latlng = new L.LatLng(entry[latField], entry[lngField]);
      var dataObj = { latlng: latlng };
      
      dataObj[valueField] = entry[valueField];
      this._max = Math.max(this._max, dataObj[valueField]);

      if (entry.radius) {
        dataObj.radius = entry.radius;
      }
      this._data.push(dataObj);
      this._draw();
    }
  },
  _resetOrigin: function () {
    this._origin = this._map.layerPointToLatLng(new L.Point(0, 0));
    this._draw();
  } 
});

HeatmapOverlay.CSS_TRANSFORM = (function() {
  var div = document.createElement('div');
  var props = [
  'transform',
  'WebkitTransform',
  'MozTransform',
  'OTransform',
  'msTransform'
  ];

  for (var i = 0; i < props.length; i++) {
    var prop = props[i];
    if (div.style[prop] !== undefined) {
      return prop;
    }
  }

  return props[0];
})();;(function () {
	'use strict';

	L.TileLayer.Provider = L.TileLayer.extend({
		initialize: function (arg, options) {
			var providers = L.TileLayer.Provider.providers;

			var parts = arg.split('.');

			var providerName = parts[0];
			var variantName = parts[1];

			if (!providers[providerName]) {
				throw 'No such provider (' + providerName + ')';
			}

			var provider = {
				url: providers[providerName].url,
				options: providers[providerName].options
			};

			// overwrite values in provider from variant.
			if (variantName && 'variants' in providers[providerName]) {
				if (!(variantName in providers[providerName].variants)) {
					throw 'No such variant of ' + providerName + ' (' + variantName + ')';
				}
				var variant = providers[providerName].variants[variantName];
				var variantOptions;
				if (typeof variant === 'string') {
					variantOptions = {
						variant: variant
					};
				} else {
					variantOptions = variant.options;
				}
				provider = {
					url: variant.url || provider.url,
					options: L.Util.extend({}, provider.options, variantOptions)
				};
			} else if (typeof provider.url === 'function') {
				provider.url = provider.url(parts.splice(1, parts.length - 1).join('.'));
			}

			var forceHTTP = window.location.protocol === 'file:' || provider.options.forceHTTP;
			if (provider.url.indexOf('//') === 0 && forceHTTP) {
				provider.url = 'http:' + provider.url;
			}

			// replace attribution placeholders with their values from toplevel provider attribution,
			// recursively
			var attributionReplacer = function (attr) {
				if (attr.indexOf('{attribution.') === -1) {
					return attr;
				}
				return attr.replace(/\{attribution.(\w*)\}/,
					function (match, attributionName) {
						return attributionReplacer(providers[attributionName].options.attribution);
					}
				);
			};
			provider.options.attribution = attributionReplacer(provider.options.attribution);

			// Compute final options combining provider options with any user overrides
			var layerOpts = L.Util.extend({}, provider.options, options);
			L.TileLayer.prototype.initialize.call(this, provider.url, layerOpts);
		}
	});

	/**
	 * Definition of providers.
	 * see http://leafletjs.com/reference.html#tilelayer for options in the options map.
	 */

	L.TileLayer.Provider.providers = {
		OpenStreetMap: {
			url: '//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
			options: {
				maxZoom: 19,
				attribution:
					'&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
			},
			variants: {
				Mapnik: {},
				BlackAndWhite: {
					url: 'http://{s}.tiles.wmflabs.org/bw-mapnik/{z}/{x}/{y}.png',
					options: {
						maxZoom: 18
					}
				},
				DE: {
					url: 'http://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png',
					options: {
						maxZoom: 18
					}
				},
				France: {
					url: 'http://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
					options: {
						attribution: '&copy; Openstreetmap France | {attribution.OpenStreetMap}'
					}
				},
				HOT: {
					url: 'http://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
					options: {
						attribution: '{attribution.OpenStreetMap}, Tiles courtesy of <a href="http://hot.openstreetmap.org/" target="_blank">Humanitarian OpenStreetMap Team</a>'
					}
				}
			}
		},
		OpenSeaMap: {
			url: 'http://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
			options: {
				attribution: 'Map data: &copy; <a href="http://www.openseamap.org">OpenSeaMap</a> contributors'
			}
		},
		OpenTopoMap: {
			url: '//{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
			options: {
				maxZoom: 16,
				attribution: 'Map data: {attribution.OpenStreetMap}, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
			}
		},
		Thunderforest: {
			url: '//{s}.tile.thunderforest.com/{variant}/{z}/{x}/{y}.png',
			options: {
				attribution:
					'&copy; <a href="http://www.opencyclemap.org">OpenCycleMap</a>, {attribution.OpenStreetMap}',
				variant: 'cycle'
			},
			variants: {
				OpenCycleMap: 'cycle',
				Transport: {
					options: {
						variant: 'transport',
						maxZoom: 19
					}
				},
				TransportDark: {
					options: {
						variant: 'transport-dark',
						maxZoom: 19
					}
				},
				Landscape: 'landscape',
				Outdoors: 'outdoors'
			}
		},
		OpenMapSurfer: {
			url: 'http://openmapsurfer.uni-hd.de/tiles/{variant}/x={x}&y={y}&z={z}',
			options: {
				maxZoom: 20,
				variant: 'roads',
				attribution: 'Imagery from <a href="http://giscience.uni-hd.de/">GIScience Research Group @ University of Heidelberg</a> &mdash; Map data {attribution.OpenStreetMap}'
			},
			variants: {
				Roads: 'roads',
				AdminBounds: {
					options: {
						variant: 'adminb',
						maxZoom: 19
					}
				},
				Grayscale: {
					options: {
						variant: 'roadsg',
						maxZoom: 19
					}
				}
			}
		},
		Hydda: {
			url: 'http://{s}.tile.openstreetmap.se/hydda/{variant}/{z}/{x}/{y}.png',
			options: {
				variant: 'full',
				attribution: 'Tiles courtesy of <a href="http://openstreetmap.se/" target="_blank">OpenStreetMap Sweden</a> &mdash; Map data {attribution.OpenStreetMap}'
			},
			variants: {
				Full: 'full',
				Base: 'base',
				RoadsAndLabels: 'roads_and_labels'
			}
		},
		MapQuestOpen: {
			/* Mapquest does support https, but with a different subdomain:
			 * https://otile{s}-s.mqcdn.com/tiles/1.0.0/{type}/{z}/{x}/{y}.{ext}
			 * which makes implementing protocol relativity impossible.
			 */
			url: 'http://otile{s}.mqcdn.com/tiles/1.0.0/{type}/{z}/{x}/{y}.{ext}',
			options: {
				type: 'map',
				ext: 'jpg',
				attribution:
					'Tiles Courtesy of <a href="http://www.mapquest.com/">MapQuest</a> &mdash; ' +
					'Map data {attribution.OpenStreetMap}',
				subdomains: '1234'
			},
			variants: {
				OSM: {},
				Aerial: {
					options: {
						type: 'sat',
						attribution:
							'Tiles Courtesy of <a href="http://www.mapquest.com/">MapQuest</a> &mdash; ' +
							'Portions Courtesy NASA/JPL-Caltech and U.S. Depart. of Agriculture, Farm Service Agency'
					}
				},
				HybridOverlay: {
					options: {
						type: 'hyb',
						ext: 'png',
						opacity: 0.9
					}
				}
			}
		},
		MapBox: {
			url: function (id) {
				return '//{s}.tiles.mapbox.com/v3/' + id + '/{z}/{x}/{y}.png';
			},
			options: {
				attribution:
					'Imagery from <a href="http://mapbox.com/about/maps/">MapBox</a> &mdash; ' +
					'Map data {attribution.OpenStreetMap}',
				subdomains: 'abcd'
			}
		},
		Stamen: {
			url: '//stamen-tiles-{s}.a.ssl.fastly.net/{variant}/{z}/{x}/{y}.png',
			options: {
				attribution:
					'Map tiles by <a href="http://stamen.com">Stamen Design</a>, ' +
					'<a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; ' +
					'Map data {attribution.OpenStreetMap}',
				subdomains: 'abcd',
				minZoom: 0,
				maxZoom: 20,
				variant: 'toner',
				ext: 'png'
			},
			variants: {
				Toner: 'toner',
				TonerBackground: 'toner-background',
				TonerHybrid: 'toner-hybrid',
				TonerLines: 'toner-lines',
				TonerLabels: 'toner-labels',
				TonerLite: 'toner-lite',
				Watercolor: {
					options: {
						variant: 'watercolor',
						minZoom: 1,
						maxZoom: 16
					}
				},
				Terrain: {
					options: {
						variant: 'terrain',
						minZoom: 4,
						maxZoom: 18,
						bounds: [[22, -132], [70, -56]]
					}
				},
				TerrainBackground: {
					options: {
						variant: 'terrain-background',
						minZoom: 4,
						maxZoom: 18,
						bounds: [[22, -132], [70, -56]]
					}
				},
				TopOSMRelief: {
					options: {
						variant: 'toposm-color-relief',
						ext: 'jpg',
						bounds: [[22, -132], [51, -56]]
					}
				},
				TopOSMFeatures: {
					options: {
						variant: 'toposm-features',
						bounds: [[22, -132], [51, -56]],
						opacity: 0.9
					}
				}
			}
		},
		Esri: {
			url: '//server.arcgisonline.com/ArcGIS/rest/services/{variant}/MapServer/tile/{z}/{y}/{x}',
			options: {
				variant: 'World_Street_Map',
				attribution: 'Tiles &copy; Esri'
			},
			variants: {
				WorldStreetMap: {
					options: {
						attribution:
							'{attribution.Esri} &mdash; ' +
							'Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
					}
				},
				DeLorme: {
					options: {
						variant: 'Specialty/DeLorme_World_Base_Map',
						minZoom: 1,
						maxZoom: 11,
						attribution: '{attribution.Esri} &mdash; Copyright: &copy;2012 DeLorme'
					}
				},
				WorldTopoMap: {
					options: {
						variant: 'World_Topo_Map',
						attribution:
							'{attribution.Esri} &mdash; ' +
							'Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
					}
				},
				WorldImagery: {
					options: {
						variant: 'World_Imagery',
						attribution:
							'{attribution.Esri} &mdash; ' +
							'Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
					}
				},
				WorldTerrain: {
					options: {
						variant: 'World_Terrain_Base',
						maxZoom: 13,
						attribution:
							'{attribution.Esri} &mdash; ' +
							'Source: USGS, Esri, TANA, DeLorme, and NPS'
					}
				},
				WorldShadedRelief: {
					options: {
						variant: 'World_Shaded_Relief',
						maxZoom: 13,
						attribution: '{attribution.Esri} &mdash; Source: Esri'
					}
				},
				WorldPhysical: {
					options: {
						variant: 'World_Physical_Map',
						maxZoom: 8,
						attribution: '{attribution.Esri} &mdash; Source: US National Park Service'
					}
				},
				OceanBasemap: {
					options: {
						variant: 'Ocean_Basemap',
						maxZoom: 13,
						attribution: '{attribution.Esri} &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri'
					}
				},
				NatGeoWorldMap: {
					options: {
						variant: 'NatGeo_World_Map',
						maxZoom: 16,
						attribution: '{attribution.Esri} &mdash; National Geographic, Esri, DeLorme, NAVTEQ, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC'
					}
				},
				WorldGrayCanvas: {
					options: {
						variant: 'Canvas/World_Light_Gray_Base',
						maxZoom: 16,
						attribution: '{attribution.Esri} &mdash; Esri, DeLorme, NAVTEQ'
					}
				}
			}
		},
		OpenWeatherMap: {
			url: 'http://{s}.tile.openweathermap.org/map/{variant}/{z}/{x}/{y}.png',
			options: {
				maxZoom: 19,
				attribution: 'Map data &copy; <a href="http://openweathermap.org">OpenWeatherMap</a>',
				opacity: 0.5
			},
			variants: {
				Clouds: 'clouds',
				CloudsClassic: 'clouds_cls',
				Precipitation: 'precipitation',
				PrecipitationClassic: 'precipitation_cls',
				Rain: 'rain',
				RainClassic: 'rain_cls',
				Pressure: 'pressure',
				PressureContour: 'pressure_cntr',
				Wind: 'wind',
				Temperature: 'temp',
				Snow: 'snow'
			}
		},
		HERE: {
			/*
			 * HERE maps, formerly Nokia maps.
			 * These basemaps are free, but you need an API key. Please sign up at
			 * http://developer.here.com/getting-started
			 *
			 * Note that the base urls contain '.cit' whichs is HERE's
			 * 'Customer Integration Testing' environment. Please remove for production
			 * envirionments.
			 */
			url:
				'//{s}.{base}.maps.cit.api.here.com/maptile/2.1/' +
				'maptile/{mapID}/{variant}/{z}/{x}/{y}/256/png8?' +
				'app_id={app_id}&app_code={app_code}',
			options: {
				attribution:
					'Map &copy; 1987-2014 <a href="http://developer.here.com">HERE</a>',
				subdomains: '1234',
				mapID: 'newest',
				'app_id': '<insert your app_id here>',
				'app_code': '<insert your app_code here>',
				base: 'base',
				variant: 'normal.day',
				maxZoom: 20
			},
			variants: {
				normalDay: 'normal.day',
				normalDayCustom: 'normal.day.custom',
				normalDayGrey: 'normal.day.grey',
				normalDayMobile: 'normal.day.mobile',
				normalDayGreyMobile: 'normal.day.grey.mobile',
				normalDayTransit: 'normal.day.transit',
				normalDayTransitMobile: 'normal.day.transit.mobile',
				normalNight: 'normal.night',
				normalNightMobile: 'normal.night.mobile',
				normalNightGrey: 'normal.night.grey',
				normalNightGreyMobile: 'normal.night.grey.mobile',

				carnavDayGrey: 'carnav.day.grey',
				hybridDay: {
					options: {
						base: 'aerial',
						variant: 'hybrid.day'
					}
				},
				hybridDayMobile: {
					options: {
						base: 'aerial',
						variant: 'hybrid.day.mobile'
					}
				},
				pedestrianDay: 'pedestrian.day',
				pedestrianNight: 'pedestrian.night',
				satelliteDay: {
					options: {
						base: 'aerial',
						variant: 'satellite.day'
					}
				},
				terrainDay: {
					options: {
						base: 'aerial',
						variant: 'terrain.day'
					}
				},
				terrainDayMobile: {
					options: {
						base: 'aerial',
						variant: 'terrain.day.mobile'
					}
				}
			}
		},
		Acetate: {
			url: 'http://a{s}.acetate.geoiq.com/tiles/{variant}/{z}/{x}/{y}.png',
			options: {
				attribution:
					'&copy;2012 Esri & Stamen, Data from OSM and Natural Earth',
				subdomains: '0123',
				minZoom: 2,
				maxZoom: 18,
				variant: 'acetate-base'
			},
			variants: {
				basemap: 'acetate-base',
				terrain: 'terrain',
				all: 'acetate-hillshading',
				foreground: 'acetate-fg',
				roads: 'acetate-roads',
				labels: 'acetate-labels',
				hillshading: 'hillshading'
			}
		},
		FreeMapSK: {
			url: 'http://{s}.freemap.sk/T/{z}/{x}/{y}.jpeg',
			options: {
				minZoom: 8,
				maxZoom: 16,
				subdomains: ['t1', 't2', 't3', 't4'],
				attribution:
					'{attribution.OpenStreetMap}, vizualization CC-By-SA 2.0 <a href="http://freemap.sk">Freemap.sk</a>'
			}
		},
		MtbMap: {
			url: 'http://tile.mtbmap.cz/mtbmap_tiles/{z}/{x}/{y}.png',
			options: {
				attribution:
					'{attribution.OpenStreetMap} &amp; USGS'
			}
		},
		CartoDB: {
			url: 'http://{s}.basemaps.cartocdn.com/{variant}/{z}/{x}/{y}.png',
			options: {
				attribution: '{attribution.OpenStreetMap} &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
				subdomains: 'abcd',
				maxZoom: 19,
				variant: 'light_all'
			},
			variants: {
				Positron: 'light_all',
				PositronNoLabels: 'light_nolabels',
				DarkMatter: 'dark_all',
				DarkMatterNoLabels: 'dark_nolabels'
			}
		},
		HikeBike: {
			url: 'http://{s}.tiles.wmflabs.org/{variant}/{z}/{x}/{y}.png',
			options: {
				maxZoom: 19,
				attribution: '{attribution.OpenStreetMap}',
				variant: 'hikebike'
			},
			variants: {
				HikeBike: {},
				HillShading: {
					options: {
						maxZoom: 15,
						variant: 'hillshading'
					}
				}
			}
		},
		BasemapAT: {
			url: '//maps{s}.wien.gv.at/basemap/{variant}/normal/google3857/{z}/{y}/{x}.{format}',
			options: {
				maxZoom: 19,
				attribution: 'Datenquelle: <a href="www.basemap.at">basemap.at</a>',
				subdomains: ['', '1', '2', '3', '4'],
				format: 'png',
				bounds: [[46.358770, 8.782379], [49.037872, 17.189532]],
				variant: 'geolandbasemap'
			},
			variants: {
				basemap: 'geolandbasemap',
				grau: 'bmapgrau',
				overlay: 'bmapoverlay',
				highdpi: {
					options: {
						variant: 'bmaphidpi',
						format: 'jpeg'
					}
				},
				orthofoto: {
					options: {
						variant: 'bmaporthofoto30cm',
						format: 'jpeg'
					}
				}
			}
		},
		NASAGIBS: {
			url: '//map1.vis.earthdata.nasa.gov/wmts-webmerc/{variant}/default/{time}/{tilematrixset}{maxZoom}/{z}/{y}/{x}.{format}',
			options: {
				attribution:
					'Imagery provided by services from the Global Imagery Browse Services (GIBS), operated by the NASA/GSFC/Earth Science Data and Information System ' +
					'(<a href="https://earthdata.nasa.gov">ESDIS</a>) with funding provided by NASA/HQ.',
				bounds: [[-85.0511287776, -179.999999975], [85.0511287776, 179.999999975]],
				minZoom: 1,
				maxZoom: 9,
				format: 'jpg',
				time: '',
				tilematrixset: 'GoogleMapsCompatible_Level'
			},
			variants: {
				ModisTerraTrueColorCR: 'MODIS_Terra_CorrectedReflectance_TrueColor',
				ModisTerraBands367CR: 'MODIS_Terra_CorrectedReflectance_Bands367',
				ViirsEarthAtNight2012: {
					options: {
						variant: 'VIIRS_CityLights_2012',
						maxZoom: 8
					}
				},
				ModisTerraLSTDay: {
					options: {
						variant: 'MODIS_Terra_Land_Surface_Temp_Day',
						format: 'png',
						maxZoom: 7,
						opacity: 0.75
					}
				},
				ModisTerraSnowCover: {
					options: {
						variant: 'MODIS_Terra_Snow_Cover',
						format: 'png',
						maxZoom: 8,
						opacity: 0.75
					}
				},
				ModisTerraAOD: {
					options: {
						variant: 'MODIS_Terra_Aerosol',
						format: 'png',
						maxZoom: 6,
						opacity: 0.75
					}
				},
				ModisTerraChlorophyll: {
					options: {
						variant: 'MODIS_Terra_Chlorophyll_A',
						format: 'png',
						maxZoom: 7,
						opacity: 0.75
					}
				}
			}
		}
	};

	L.tileLayer.provider = function (provider, options) {
		return new L.TileLayer.Provider(provider, options);
	};
}());;/*
	Leaflet.label, a plugin that adds labels to markers and vectors for Leaflet powered maps.
	(c) 2012-2013, Jacob Toye, Smartrak
	https://github.com/Leaflet/Leaflet.label
	http://leafletjs.com
	https://github.com/jacobtoye
*/
(function (window, document, undefined) {
var L = window.L;/*
 * Leaflet.label assumes that you have already included the Leaflet library.
 */

L.labelVersion = '0.2.2-dev';

L.Label = (L.Layer ? L.Layer : L.Class).extend({

	includes: L.Mixin.Events,

	options: {
		className: '',
		clickable: false,
		direction: 'right',
		noHide: false,
		offset: [12, -15], // 6 (width of the label triangle) + 6 (padding)
		opacity: 1,
		zoomAnimation: true
	},

	initialize: function (options, source) {
		L.setOptions(this, options);

		this._source = source;
		this._animated = L.Browser.any3d && this.options.zoomAnimation;
		this._isOpen = false;
	},

	onAdd: function (map) {
		this._map = map;

		this._pane = this.options.pane ? map._panes[this.options.pane] :
			this._source instanceof L.Marker ? map._panes.markerPane : map._panes.popupPane;

		if (!this._container) {
			this._initLayout();
		}

		this._pane.appendChild(this._container);

		this._initInteraction();

		this._update();

		this.setOpacity(this.options.opacity);

		map
			.on('moveend', this._onMoveEnd, this)
			.on('viewreset', this._onViewReset, this);

		if (this._animated) {
			map.on('zoomanim', this._zoomAnimation, this);
		}

		if (L.Browser.touch && !this.options.noHide) {
			L.DomEvent.on(this._container, 'click', this.close, this);
			map.on('click', this.close, this);
		}
	},

	onRemove: function (map) {
		this._pane.removeChild(this._container);

		map.off({
			zoomanim: this._zoomAnimation,
			moveend: this._onMoveEnd,
			viewreset: this._onViewReset
		}, this);

		this._removeInteraction();

		this._map = null;
	},

	setLatLng: function (latlng) {
		this._latlng = L.latLng(latlng);
		if (this._map) {
			this._updatePosition();
		}
		return this;
	},

	setContent: function (content) {
		// Backup previous content and store new content
		this._previousContent = this._content;
		this._content = content;

		this._updateContent();

		return this;
	},

	close: function () {
		var map = this._map;

		if (map) {
			if (L.Browser.touch && !this.options.noHide) {
				L.DomEvent.off(this._container, 'click', this.close);
				map.off('click', this.close, this);
			}

			map.removeLayer(this);
		}
	},

	updateZIndex: function (zIndex) {
		this._zIndex = zIndex;

		if (this._container && this._zIndex) {
			this._container.style.zIndex = zIndex;
		}
	},

	setOpacity: function (opacity) {
		this.options.opacity = opacity;

		if (this._container) {
			L.DomUtil.setOpacity(this._container, opacity);
		}
	},

	_initLayout: function () {
		this._container = L.DomUtil.create('div', 'leaflet-label ' + this.options.className + ' leaflet-zoom-animated');
		this.updateZIndex(this._zIndex);
	},

	_update: function () {
		if (!this._map) { return; }

		this._container.style.visibility = 'hidden';

		this._updateContent();
		this._updatePosition();

		this._container.style.visibility = '';
	},

	_updateContent: function () {
		if (!this._content || !this._map || this._prevContent === this._content) {
			return;
		}

		if (typeof this._content === 'string') {
			this._container.innerHTML = this._content;

			this._prevContent = this._content;

			this._labelWidth = this._container.offsetWidth;
		}
	},

	_updatePosition: function () {
		var pos = this._map.latLngToLayerPoint(this._latlng);

		this._setPosition(pos);
	},

	_setPosition: function (pos) {
		var map = this._map,
			container = this._container,
			centerPoint = map.latLngToContainerPoint(map.getCenter()),
			labelPoint = map.layerPointToContainerPoint(pos),
			direction = this.options.direction,
			labelWidth = this._labelWidth,
			offset = L.point(this.options.offset);

		// position to the right (right or auto & needs to)
		if (direction === 'right' || direction === 'auto' && labelPoint.x < centerPoint.x) {
			L.DomUtil.addClass(container, 'leaflet-label-right');
			L.DomUtil.removeClass(container, 'leaflet-label-left');

			pos = pos.add(offset);
		} else { // position to the left
			L.DomUtil.addClass(container, 'leaflet-label-left');
			L.DomUtil.removeClass(container, 'leaflet-label-right');

			pos = pos.add(L.point(-offset.x - labelWidth, offset.y));
		}

		L.DomUtil.setPosition(container, pos);
	},

	_zoomAnimation: function (opt) {
		var pos = this._map._latLngToNewLayerPoint(this._latlng, opt.zoom, opt.center).round();

		this._setPosition(pos);
	},

	_onMoveEnd: function () {
		if (!this._animated || this.options.direction === 'auto') {
			this._updatePosition();
		}
	},

	_onViewReset: function (e) {
		/* if map resets hard, we must update the label */
		if (e && e.hard) {
			this._update();
		}
	},

	_initInteraction: function () {
		if (!this.options.clickable) { return; }

		var container = this._container,
			events = ['dblclick', 'mousedown', 'mouseover', 'mouseout', 'contextmenu'];

		L.DomUtil.addClass(container, 'leaflet-clickable');
		L.DomEvent.on(container, 'click', this._onMouseClick, this);

		for (var i = 0; i < events.length; i++) {
			L.DomEvent.on(container, events[i], this._fireMouseEvent, this);
		}
	},

	_removeInteraction: function () {
		if (!this.options.clickable) { return; }

		var container = this._container,
			events = ['dblclick', 'mousedown', 'mouseover', 'mouseout', 'contextmenu'];

		L.DomUtil.removeClass(container, 'leaflet-clickable');
		L.DomEvent.off(container, 'click', this._onMouseClick, this);

		for (var i = 0; i < events.length; i++) {
			L.DomEvent.off(container, events[i], this._fireMouseEvent, this);
		}
	},

	_onMouseClick: function (e) {
		if (this.hasEventListeners(e.type)) {
			L.DomEvent.stopPropagation(e);
		}

		this.fire(e.type, {
			originalEvent: e
		});
	},

	_fireMouseEvent: function (e) {
		this.fire(e.type, {
			originalEvent: e
		});

		// TODO proper custom event propagation
		// this line will always be called if marker is in a FeatureGroup
		if (e.type === 'contextmenu' && this.hasEventListeners(e.type)) {
			L.DomEvent.preventDefault(e);
		}
		if (e.type !== 'mousedown') {
			L.DomEvent.stopPropagation(e);
		} else {
			L.DomEvent.preventDefault(e);
		}
	}
});


// This object is a mixin for L.Marker and L.CircleMarker. We declare it here as both need to include the contents.
L.BaseMarkerMethods = {
	showLabel: function () {
		if (this.label && this._map) {
			this.label.setLatLng(this._latlng);
			this._map.showLabel(this.label);
		}

		return this;
	},

	hideLabel: function () {
		if (this.label) {
			this.label.close();
		}
		return this;
	},

	setLabelNoHide: function (noHide) {
		if (this._labelNoHide === noHide) {
			return;
		}

		this._labelNoHide = noHide;

		if (noHide) {
			this._removeLabelRevealHandlers();
			this.showLabel();
		} else {
			this._addLabelRevealHandlers();
			this.hideLabel();
		}
	},

	bindLabel: function (content, options) {
		var labelAnchor = this.options.icon ? this.options.icon.options.labelAnchor : this.options.labelAnchor,
			anchor = L.point(labelAnchor) || L.point(0, 0);

		anchor = anchor.add(L.Label.prototype.options.offset);

		if (options && options.offset) {
			anchor = anchor.add(options.offset);
		}

		options = L.Util.extend({offset: anchor}, options);

		this._labelNoHide = options.noHide;

		if (!this.label) {
			if (!this._labelNoHide) {
				this._addLabelRevealHandlers();
			}

			this
				.on('remove', this.hideLabel, this)
				.on('move', this._moveLabel, this)
				.on('add', this._onMarkerAdd, this);

			this._hasLabelHandlers = true;
		}

		this.label = new L.Label(options, this)
			.setContent(content);

		return this;
	},

	unbindLabel: function () {
		if (this.label) {
			this.hideLabel();

			this.label = null;

			if (this._hasLabelHandlers) {
				if (!this._labelNoHide) {
					this._removeLabelRevealHandlers();
				}

				this
					.off('remove', this.hideLabel, this)
					.off('move', this._moveLabel, this)
					.off('add', this._onMarkerAdd, this);
			}

			this._hasLabelHandlers = false;
		}
		return this;
	},

	updateLabelContent: function (content) {
		if (this.label) {
			this.label.setContent(content);
		}
	},

	getLabel: function () {
		return this.label;
	},

	_onMarkerAdd: function () {
		if (this._labelNoHide) {
			this.showLabel();
		}
	},

	_addLabelRevealHandlers: function () {
		this
			.on('mouseover', this.showLabel, this)
			.on('mouseout', this.hideLabel, this);

		if (L.Browser.touch) {
			this.on('click', this.showLabel, this);
		}
	},

	_removeLabelRevealHandlers: function () {
		this
			.off('mouseover', this.showLabel, this)
			.off('mouseout', this.hideLabel, this);

		if (L.Browser.touch) {
			this.off('click', this.showLabel, this);
		}
	},

	_moveLabel: function (e) {
		this.label.setLatLng(e.latlng);
	}
};

// Add in an option to icon that is used to set where the label anchor is
L.Icon.Default.mergeOptions({
	labelAnchor: new L.Point(9, -20)
});

// Have to do this since Leaflet is loaded before this plugin and initializes
// L.Marker.options.icon therefore missing our mixin above.
L.Marker.mergeOptions({
	icon: new L.Icon.Default()
});

L.Marker.include(L.BaseMarkerMethods);
L.Marker.include({
	_originalUpdateZIndex: L.Marker.prototype._updateZIndex,

	_updateZIndex: function (offset) {
		var zIndex = this._zIndex + offset;

		this._originalUpdateZIndex(offset);

		if (this.label) {
			this.label.updateZIndex(zIndex);
		}
	},

	_originalSetOpacity: L.Marker.prototype.setOpacity,

	setOpacity: function (opacity, labelHasSemiTransparency) {
		this.options.labelHasSemiTransparency = labelHasSemiTransparency;

		this._originalSetOpacity(opacity);
	},

	_originalUpdateOpacity: L.Marker.prototype._updateOpacity,

	_updateOpacity: function () {
		var absoluteOpacity = this.options.opacity === 0 ? 0 : 1;

		this._originalUpdateOpacity();

		if (this.label) {
			this.label.setOpacity(this.options.labelHasSemiTransparency ? this.options.opacity : absoluteOpacity);
		}
	},

	_originalSetLatLng: L.Marker.prototype.setLatLng,

	setLatLng: function (latlng) {
		if (this.label && !this._labelNoHide) {
			this.hideLabel();
		}

		return this._originalSetLatLng(latlng);
	}
});

// Add in an option to icon that is used to set where the label anchor is
L.CircleMarker.mergeOptions({
	labelAnchor: new L.Point(0, 0)
});


L.CircleMarker.include(L.BaseMarkerMethods);

L.Path.include({
	bindLabel: function (content, options) {
		if (!this.label || this.label.options !== options) {
			this.label = new L.Label(options, this);
		}

		this.label.setContent(content);

		if (!this._showLabelAdded) {
			this
				.on('mouseover', this._showLabel, this)
				.on('mousemove', this._moveLabel, this)
				.on('mouseout remove', this._hideLabel, this);

			if (L.Browser.touch) {
				this.on('click', this._showLabel, this);
			}
			this._showLabelAdded = true;
		}

		return this;
	},

	unbindLabel: function () {
		if (this.label) {
			this._hideLabel();
			this.label = null;
			this._showLabelAdded = false;
			this
				.off('mouseover', this._showLabel, this)
				.off('mousemove', this._moveLabel, this)
				.off('mouseout remove', this._hideLabel, this);
		}
		return this;
	},

	updateLabelContent: function (content) {
		if (this.label) {
			this.label.setContent(content);
		}
	},

	_showLabel: function (e) {
		this.label.setLatLng(e.latlng);
		this._map.showLabel(this.label);
	},

	_moveLabel: function (e) {
		this.label.setLatLng(e.latlng);
	},

	_hideLabel: function () {
		this.label.close();
	}
});

L.Map.include({
	showLabel: function (label) {
		return this.addLayer(label);
	}
});

L.FeatureGroup.include({
	// TODO: remove this when AOP is supported in Leaflet, need this as we cannot put code in removeLayer()
	clearLayers: function () {
		this.unbindLabel();
		this.eachLayer(this.removeLayer, this);
		return this;
	},

	bindLabel: function (content, options) {
		return this.invoke('bindLabel', content, options);
	},

	unbindLabel: function () {
		return this.invoke('unbindLabel');
	},

	updateLabelContent: function (content) {
		this.invoke('updateLabelContent', content);
	}
});

}(window, document));;L.Icon.Label = L.Icon.extend({
	options: {
		/*
		labelAnchor: (Point) (top left position of the label within the wrapper, default is right)
		wrapperAnchor: (Point) (position of icon and label relative to Lat/Lng)
		iconAnchor: (Point) (top left position of icon within wrapper)
		labelText: (String) (label's text component, if this is null the element will not be created)
		*/
		/* Icon options:
		iconUrl: (String) (required)
		iconSize: (Point) (can be set through CSS)
		iconAnchor: (Point) (centered by default if size is specified, can be set in CSS with negative margins)
		popupAnchor: (Point) (if not specified, popup opens in the anchor point)
		shadowUrl: (Point) (no shadow by default)
		shadowSize: (Point)
		*/
		labelClassName: ''
	},
	
	initialize: function (options) {
		L.Util.setOptions(this, options);
		L.Icon.prototype.initialize.call(this, this.options);
	},

	setLabelAsHidden: function () {
		this._labelHidden = true;
	},

	createIcon: function () {
		return this._createLabel(L.Icon.prototype.createIcon.call(this));
	},
	
	createShadow: function () {
		if (!this.options.shadowUrl) {
			return null;
		}
		var shadow = L.Icon.prototype.createShadow.call(this);
		//need to reposition the shadow
		if (shadow) {
			shadow.style.marginLeft = (-this.options.wrapperAnchor.x) + 'px';
			shadow.style.marginTop = (-this.options.wrapperAnchor.y) + 'px';
		}
		return shadow;
	},

	updateLabel: function (icon, text) {
		if (icon.nodeName.toUpperCase() === 'DIV') {
			icon.childNodes[1].innerHTML = text;
			
			this.options.labelText = text;
		}
	},

	showLabel: function (icon) {
		if (!this._labelTextIsSet()) {
			return;
		}

		icon.childNodes[1].style.display = 'block';
	},

	hideLabel: function (icon) {
		if (!this._labelTextIsSet()) {
			return;
		}

		icon.childNodes[1].style.display = 'none';
	},

	_createLabel: function (img) {
		if (!this._labelTextIsSet()) {
			return img;
		}

		var wrapper = document.createElement('div'),
			label = document.createElement('span');

		// set up wrapper anchor
		wrapper.style.marginLeft = (-this.options.wrapperAnchor.x) + 'px';
		wrapper.style.marginTop = (-this.options.wrapperAnchor.y) + 'px';

		wrapper.className = 'leaflet-marker-icon-wrapper leaflet-zoom-animated';

		// set up label
		label.className = 'leaflet-marker-iconlabel ' + this.options.labelClassName;

		label.innerHTML = this.options.labelText;

		label.style.marginLeft = this.options.labelAnchor.x + 'px';
		label.style.marginTop = this.options.labelAnchor.y + 'px';

		if (this._labelHidden) {
			label.style.display = 'none';
			// Ensure that the pointer cursor shows
			img.style.cursor = 'pointer';
		}
		
		//reset icons margins (as super makes them -ve)
		img.style.marginLeft = this.options.iconAnchor.x + 'px';
		img.style.marginTop = this.options.iconAnchor.y + 'px';
		
		wrapper.appendChild(img);
		wrapper.appendChild(label);

		return wrapper;
	},
	
	_labelTextIsSet: function () {
		return typeof this.options.labelText !== 'undefined' && this.options.labelText !== null;
	}
});

L.Icon.Label.Default = L.Icon.Label.extend({
	options: {
		//This is the top left position of the label within the wrapper. By default it will display at the right
		//middle position of the default icon. x = width of icon + padding
		//If the icon height is greater than the label height you will need to set the y value.
		//y = (icon height - label height) / 2
		labelAnchor: new L.Point(29, 8),
		
		//This is the position of the wrapper div. Use this to position icon + label relative to the Lat/Lng.
		//By default the point of the default icon is anchor
		wrapperAnchor: new L.Point(13, 41),
		
		//This is now the top left position of the icon within the wrapper.
		//If the label height is greater than the icon you will need to set the y value.
		//y = (label height - icon height) / 2
		iconAnchor: new L.Point(0, 0),
		
		//label's text component, if this is null the element will not be created
		labelText: null,
		
		/* From L.Icon.Default */
		iconUrl: L.Icon.Default.imagePath + '/marker-icon.png',
		iconSize: new L.Point(25, 41),
		popupAnchor: new L.Point(0, -33),

		shadowUrl: L.Icon.Default.imagePath + '/marker-shadow.png',
		shadowSize: new L.Point(41, 41)
	}
});

L.Marker.Label = L.Marker.extend({
	updateLabel: function (text) {
		this.options.icon.updateLabel(this._icon, text);
	},

	_initIcon: function () {
		if (!(this.options.icon instanceof L.Icon.Label)) {
			throw new Error('Icon must be an instance of L.Icon.Label.');
		}

		// Ensure that the label is hidden to begin with
		if (this.options.revealing) {
			this.options.icon.setLabelAsHidden();
		}

		L.Marker.prototype._initIcon.call(this);
	},

	_removeIcon: function () {
		if (this.options.revealing) {
			L.DomEvent
				.off(this._icon, 'mouseover', this._showLabel)
				.off(this._icon, 'mouseout', this._hideLabel);
		}

		L.Marker.prototype._removeIcon.call(this);
	},

	_initInteraction: function () {
		L.Marker.prototype._initInteraction.call(this);

		if (!this.options.revealing) {
			return;
		}

		L.DomEvent
			.on(this._icon, 'mouseover', this._showLabel, this)
			.on(this._icon, 'mouseout', this._hideLabel, this);
	},

	_showLabel: function () {
		this.options.icon.showLabel(this._icon);
	},

	_hideLabel: function () {
		this.options.icon.hideLabel(this._icon);
	}
});;/**************************************************************************
* AngularJS-nvD3, v1.0.3; MIT License; 06/11/2015 13:30
* http://krispo.github.io/angular-nvd3
**************************************************************************/
(function(){

    'use strict';

    angular.module('nvd3', [])

        .directive('nvd3', ['nvd3Utils', function(nvd3Utils){
            return {
                restrict: 'AE',
                scope: {
                    data: '=',      //chart data, [required]
                    options: '=',   //chart options, according to nvd3 core api, [required]
                    api: '=?',      //directive global api, [optional]
                    events: '=?',   //global events that directive would subscribe to, [optional]
                    config: '=?'    //global directive configuration, [optional]
                },
                link: function(scope, element, attrs){
                    var defaultConfig = {
                        extended: false,
                        visible: true,
                        disabled: false,
                        autorefresh: true,
                        refreshDataOnly: true,
                        deepWatchOptions: true,
                        deepWatchData: false, // to increase performance by default
                        deepWatchConfig: true,
                        debounce: 10 // default 10ms, time silence to prevent refresh while multiple options changes at a time
                    };

                    //basic directive configuration
                    scope._config = angular.extend(defaultConfig, scope.config);

                    //directive global api
                    scope.api = {
                        // Fully refresh directive
                        refresh: function(){
                            scope.api.updateWithOptions(scope.options);
                        },

                        // Update chart layout (for example if container is resized)
                        update: function() {
                            if (scope.chart) scope.chart.update();
                        },

                        // Update chart with new options
                        updateWithOptions: function(options){
                            // Clearing
                            scope.api.clearElement();

                            // Exit if options are not yet bound
                            if (angular.isDefined(options) === false) return;

                            // Exit if chart is hidden
                            if (!scope._config.visible) return;

                            // Initialize chart with specific type
                            scope.chart = nv.models[options.chart.type]();

                            // Generate random chart ID
                            scope.chart.id = Math.random().toString(36).substr(2, 15);

                            angular.forEach(scope.chart, function(value, key){
                                if (key[0] === '_');
                                else if ([
                                        'clearHighlights',
                                        'highlightPoint',
                                        'id',
                                        'options',
                                        'resizeHandler',
                                        'state',
                                        'open',
                                        'close',
                                        'tooltipContent'
                                    ].indexOf(key) >= 0);

                                else if (key === 'dispatch') {
                                    if (options.chart[key] === undefined || options.chart[key] === null) {
                                        if (scope._config.extended) options.chart[key] = {};
                                    }
                                    configureEvents(scope.chart[key], options.chart[key]);
                                }

                                else if ([
                                        'bars',
                                        'bars1',
                                        'bars2',
                                        'boxplot',
                                        'bullet',
                                        'controls',
                                        'discretebar',
                                        'distX',
                                        'distY',
                                        'interactiveLayer',
                                        'legend',
                                        'lines',
                                        'lines1',
                                        'lines2',
                                        'multibar',
                                        'pie',
                                        'scatter',
                                        'sparkline',
                                        'stack1',
                                        'stack2',
                                        'sunburst',
                                        'tooltip',
                                        'x2Axis',
                                        'xAxis',
                                        'y1Axis',
                                        'y2Axis',
                                        'y3Axis',
                                        'y4Axis',
                                        'yAxis',
                                        'yAxis1',
                                        'yAxis2'
                                    ].indexOf(key) >= 0 ||
                                        // stacked is a component for stackedAreaChart, but a boolean for multiBarChart and multiBarHorizontalChart
                                    (key === 'stacked' && options.chart.type === 'stackedAreaChart')) {
                                    if (options.chart[key] === undefined || options.chart[key] === null) {
                                        if (scope._config.extended) options.chart[key] = {};
                                    }
                                    configure(scope.chart[key], options.chart[key], options.chart.type);
                                }

                                //TODO: need to fix bug in nvd3
                                else if ((key === 'xTickFormat' || key === 'yTickFormat') && options.chart.type === 'lineWithFocusChart');
                                else if ((key === 'tooltips') && options.chart.type === 'boxPlotChart');
                                else if ((key === 'tooltipXContent' || key === 'tooltipYContent') && options.chart.type === 'scatterChart');

                                else if (options.chart[key] === undefined || options.chart[key] === null){
                                    if (scope._config.extended) options.chart[key] = value();
                                }

                                else scope.chart[key](options.chart[key]);
                            });

                            // Update with data
                            if (options.chart.type === 'sunburstChart') {
                                scope.api.updateWithData(angular.copy(scope.data));
                            } else {
                                scope.api.updateWithData(scope.data);
                            }

                            // Configure wrappers
                            if (options['title'] || scope._config.extended) configureWrapper('title');
                            if (options['subtitle'] || scope._config.extended) configureWrapper('subtitle');
                            if (options['caption'] || scope._config.extended) configureWrapper('caption');


                            // Configure styles
                            if (options['styles'] || scope._config.extended) configureStyles();

                            nv.addGraph(function() {
                                if (!scope.chart) return;

                                // Remove resize handler. Due to async execution should be placed here, not in the clearElement
                                if (scope.chart.resizeHandler) scope.chart.resizeHandler.clear();

                                // Update the chart when window resizes
                                scope.chart.resizeHandler = nv.utils.windowResize(function() {
                                    scope.chart && scope.chart.update && scope.chart.update();
                                });

                                /// Zoom feature
                                if (options.chart.zoom !== undefined && [
                                        'scatterChart',
                                        'lineChart',
                                        'candlestickBarChart',
                                        'cumulativeLineChart',
                                        'historicalBarChart',
                                        'ohlcBarChart',
                                        'stackedAreaChart'
                                    ].indexOf(options.chart.type) > -1) {
                                    nvd3Utils.zoom(scope, options);
                                }

                                return scope.chart;
                            }, options.chart['callback']);
                        },

                        // Update chart with new data
                        updateWithData: function (data){
                            if (data) {
                                // remove whole svg element with old data
                                d3.select(element[0]).select('svg').remove();

                                var h, w;

                                // Select the current element to add <svg> element and to render the chart in
                                scope.svg = d3.select(element[0]).append('svg');
                                if (h = scope.options.chart.height) {
                                    if (!isNaN(+h)) h += 'px'; //check if height is number
                                    scope.svg.attr('height', h).style({height: h});
                                }
                                if (w = scope.options.chart.width) {
                                    if (!isNaN(+w)) w += 'px'; //check if width is number
                                    scope.svg.attr('width', w).style({width: w});
                                } else {
                                    scope.svg.attr('width', '100%').style({width: '100%'});
                                }

                                scope.svg.datum(data).call(scope.chart);
                            }
                        },

                        // Fully clear directive element
                        clearElement: function (){
                            element.find('.title').remove();
                            element.find('.subtitle').remove();
                            element.find('.caption').remove();
                            element.empty();

                            // remove tooltip if exists
                            if (scope.chart && scope.chart.tooltip && scope.chart.tooltip.id) {
                                d3.select('#' + scope.chart.tooltip.id()).remove();
                            }

                            // To be compatible with old nvd3 (v1.7.1)
                            if (nv.graphs && scope.chart) {
                                for (var i = nv.graphs.length - 1; i >= 0; i--) {
                                    if (nv.graphs[i] && (nv.graphs[i].id === scope.chart.id)) {
                                        nv.graphs.splice(i, 1);
                                    }
                                }
                            }
                            if (nv.tooltip && nv.tooltip.cleanup) {
                                nv.tooltip.cleanup();
                            }
                            if (scope.chart && scope.chart.resizeHandler) scope.chart.resizeHandler.clear();
                            scope.chart = null;
                        },

                        // Get full directive scope
                        getScope: function(){ return scope; }
                    };

                    // Configure the chart model with the passed options
                    function configure(chart, options, chartType){
                        if (chart && options){
                            angular.forEach(chart, function(value, key){
                                if (key[0] === '_');
                                else if (key === 'dispatch') {
                                    if (options[key] === undefined || options[key] === null) {
                                        if (scope._config.extended) options[key] = {};
                                    }
                                    configureEvents(value, options[key]);
                                }
                                else if (key === 'tooltip') {
                                    if (options[key] === undefined || options[key] === null) {
                                        if (scope._config.extended) options[key] = {};
                                    }
                                    configure(chart[key], options[key], chartType);
                                }
                                else if (key === 'contentGenerator') {
                                    if (options[key]) chart[key](options[key]);
                                }
                                else if ([
                                        'axis',
                                        'clearHighlights',
                                        'defined',
                                        'highlightPoint',
                                        'nvPointerEventsClass',
                                        'options',
                                        'rangeBand',
                                        'rangeBands',
                                        'scatter',
                                        'open',
                                        'close'
                                    ].indexOf(key) === -1) {
                                    if (options[key] === undefined || options[key] === null){
                                        if (scope._config.extended) options[key] = value();
                                    }
                                    else chart[key](options[key]);
                                }
                            });
                        }
                    }

                    // Subscribe to the chart events (contained in 'dispatch')
                    // and pass eventHandler functions in the 'options' parameter
                    function configureEvents(dispatch, options){
                        if (dispatch && options){
                            angular.forEach(dispatch, function(value, key){
                                if (options[key] === undefined || options[key] === null){
                                    if (scope._config.extended) options[key] = value.on;
                                }
                                else dispatch.on(key + '._', options[key]);
                            });
                        }
                    }

                    // Configure 'title', 'subtitle', 'caption'.
                    // nvd3 has no sufficient models for it yet.
                    function configureWrapper(name){
                        var _ = nvd3Utils.deepExtend(defaultWrapper(name), scope.options[name] || {});

                        if (scope._config.extended) scope.options[name] = _;

                        var wrapElement = angular.element('<div></div>').html(_['html'] || '')
                            .addClass(name).addClass(_.className)
                            .removeAttr('style')
                            .css(_.css);

                        if (!_['html']) wrapElement.text(_.text);

                        if (_.enable) {
                            if (name === 'title') element.prepend(wrapElement);
                            else if (name === 'subtitle') angular.element(element[0].querySelector('.title')).after(wrapElement);
                            else if (name === 'caption') element.append(wrapElement);
                        }
                    }

                    // Add some styles to the whole directive element
                    function configureStyles(){
                        var _ = nvd3Utils.deepExtend(defaultStyles(), scope.options['styles'] || {});

                        if (scope._config.extended) scope.options['styles'] = _;

                        angular.forEach(_.classes, function(value, key){
                            value ? element.addClass(key) : element.removeClass(key);
                        });

                        element.removeAttr('style').css(_.css);
                    }

                    // Default values for 'title', 'subtitle', 'caption'
                    function defaultWrapper(_){
                        switch (_){
                            case 'title': return {
                                enable: false,
                                text: 'Write Your Title',
                                className: 'h4',
                                css: {
                                    width: scope.options.chart.width + 'px',
                                    textAlign: 'center'
                                }
                            };
                            case 'subtitle': return {
                                enable: false,
                                text: 'Write Your Subtitle',
                                css: {
                                    width: scope.options.chart.width + 'px',
                                    textAlign: 'center'
                                }
                            };
                            case 'caption': return {
                                enable: false,
                                text: 'Figure 1. Write Your Caption text.',
                                css: {
                                    width: scope.options.chart.width + 'px',
                                    textAlign: 'center'
                                }
                            };
                        }
                    }

                    // Default values for styles
                    function defaultStyles(){
                        return {
                            classes: {
                                'with-3d-shadow': true,
                                'with-transitions': true,
                                'gallery': false
                            },
                            css: {}
                        };
                    }

                    /* Event Handling */
                    // Watching on options changing
                    scope.$watch('options', nvd3Utils.debounce(function(newOptions){
                        if (!scope._config.disabled && scope._config.autorefresh) scope.api.refresh();
                    }, scope._config.debounce, true), scope._config.deepWatchOptions);

                    // Watching on data changing
                    scope.$watch('data', function(newData, oldData){
                        if (newData !== oldData && scope.chart){
                            if (!scope._config.disabled && scope._config.autorefresh) {
                                scope._config.refreshDataOnly && scope.chart.update ? scope.chart.update() : scope.api.refresh(); // if wanted to refresh data only, use chart.update method, otherwise use full refresh.
                            }
                        }
                    }, scope._config.deepWatchData);

                    // Watching on config changing
                    scope.$watch('config', function(newConfig, oldConfig){
                        if (newConfig !== oldConfig){
                            scope._config = angular.extend(defaultConfig, newConfig);
                            scope.api.refresh();
                        }
                    }, scope._config.deepWatchConfig);

                    //subscribe on global events
                    angular.forEach(scope.events, function(eventHandler, event){
                        scope.$on(event, function(e){
                            return eventHandler(e, scope);
                        });
                    });

                    // remove completely when directive is destroyed
                    element.on('$destroy', function () {
                        scope.api.clearElement();
                    });
                }
            };
        }])

        .factory('nvd3Utils', function(){
            return {
                debounce: function(func, wait, immediate) {
                    var timeout;
                    return function() {
                        var context = this, args = arguments;
                        var later = function() {
                            timeout = null;
                            if (!immediate) func.apply(context, args);
                        };
                        var callNow = immediate && !timeout;
                        clearTimeout(timeout);
                        timeout = setTimeout(later, wait);
                        if (callNow) func.apply(context, args);
                    };
                },
                deepExtend: function(dst){
                    var me = this;
                    angular.forEach(arguments, function(obj) {
                        if (obj !== dst) {
                            angular.forEach(obj, function(value, key) {
                                if (dst[key] && dst[key].constructor && dst[key].constructor === Object) {
                                    me.deepExtend(dst[key], value);
                                } else {
                                    dst[key] = value;
                                }
                            });
                        }
                    });
                    return dst;
                },
                zoom: function(scope, options) {
                    var zoom = options.chart.zoom;

                    // check if zoom enabled
                    var enabled = (typeof zoom.enabled === 'undefined' || zoom.enabled === null) ? true : zoom.enabled;
                    if (!enabled) return;

                    var xScale = scope.chart.xAxis.scale()
                        , yScale = scope.chart.yAxis.scale()
                        , xDomain = scope.chart.xDomain || xScale.domain
                        , yDomain = scope.chart.yDomain || yScale.domain
                        , x_boundary = xScale.domain().slice()
                        , y_boundary = yScale.domain().slice()

                    // initialize zoom options
                        , scale = zoom.scale || 1
                        , translate = zoom.translate || [0, 0]
                        , scaleExtent = zoom.scaleExtent || [1, 10]
                        , useFixedDomain = zoom.useFixedDomain || false
                        , useNiceScale = zoom.useNiceScale || false
                        , horizontalOff = zoom.horizontalOff || false
                        , verticalOff = zoom.verticalOff || false
                        , unzoomEventType = zoom.unzoomEventType || 'dblclick.zoom'

                    // auxiliary functions
                        , fixDomain
                        , d3zoom
                        , zoomed
                        , unzoomed
                        ;

                    // ensure nice axis
                    if (useNiceScale) {
                        xScale.nice();
                        yScale.nice();
                    }

                    // fix domain
                    fixDomain = function (domain, boundary) {
                        domain[0] = Math.min(Math.max(domain[0], boundary[0]), boundary[1] - boundary[1] / scaleExtent[1]);
                        domain[1] = Math.max(boundary[0] + boundary[1] / scaleExtent[1], Math.min(domain[1], boundary[1]));
                        return domain;
                    };

                    // zoom event handler
                    zoomed = function () {
                        if (zoom.zoomed !== undefined) {
                            var domains = zoom.zoomed(xScale.domain(), yScale.domain());
                            if (!horizontalOff) xDomain([domains.x1, domains.x2]);
                            if (!verticalOff) yDomain([domains.y1, domains.y2]);
                        } else {
                            if (!horizontalOff) xDomain(useFixedDomain ? fixDomain(xScale.domain(), x_boundary) : xScale.domain());
                            if (!verticalOff) yDomain(useFixedDomain ? fixDomain(yScale.domain(), y_boundary) : yScale.domain());
                        }
                        scope.chart.update();
                    };

                    // unzoomed event handler
                    unzoomed = function () {
                        if (zoom.unzoomed !== undefined) {
                            var domains = zoom.unzoomed(xScale.domain(), yScale.domain());
                            if (!horizontalOff) xDomain([domains.x1, domains.x2]);
                            if (!verticalOff) yDomain([domains.y1, domains.y2]);
                        } else {
                            if (!horizontalOff) xDomain(x_boundary);
                            if (!verticalOff) yDomain(y_boundary);
                        }
                        d3zoom.scale(scale).translate(translate);
                        scope.chart.update();
                    };

                    // create d3 zoom handler
                    d3zoom = d3.behavior.zoom()
                        .x(xScale)
                        .y(yScale)
                        .scaleExtent(scaleExtent)
                        .on('zoom', zoomed);

                    scope.svg.call(d3zoom);

                    d3zoom.scale(scale).translate(translate).event(scope.svg);

                    if (unzoomEventType !== 'none') scope.svg.on(unzoomEventType, unzoomed);
                }
            };
        });
})();;!function(t,s){"function"==typeof define&&define.amd?define(s):"undefined"!=typeof module?module.exports=s():t.proj4=s()}(this,function(){var t,s,i;return function(a){function h(t,s){return x.call(t,s)}function e(t,s){var i,a,h,e,n,r,o,l,u,c,M=s&&s.split("/"),f=y.map,m=f&&f["*"]||{};if(t&&"."===t.charAt(0))if(s){for(M=M.slice(0,M.length-1),t=M.concat(t.split("/")),l=0;l<t.length;l+=1)if(c=t[l],"."===c)t.splice(l,1),l-=1;else if(".."===c){if(1===l&&(".."===t[2]||".."===t[0]))break;l>0&&(t.splice(l-1,2),l-=2)}t=t.join("/")}else 0===t.indexOf("./")&&(t=t.substring(2));if((M||m)&&f){for(i=t.split("/"),l=i.length;l>0;l-=1){if(a=i.slice(0,l).join("/"),M)for(u=M.length;u>0;u-=1)if(h=f[M.slice(0,u).join("/")],h&&(h=h[a])){e=h,n=l;break}if(e)break;!r&&m&&m[a]&&(r=m[a],o=l)}!e&&r&&(e=r,n=o),e&&(i.splice(0,n,e),t=i.join("/"))}return t}function n(t,s){return function(){return f.apply(a,v.call(arguments,0).concat([t,s]))}}function r(t){return function(s){return e(s,t)}}function o(t){return function(s){_[t]=s}}function l(t){if(h(d,t)){var s=d[t];delete d[t],g[t]=!0,M.apply(a,s)}if(!h(_,t)&&!h(g,t))throw new Error("No "+t);return _[t]}function u(t){var s,i=t?t.indexOf("!"):-1;return i>-1&&(s=t.substring(0,i),t=t.substring(i+1,t.length)),[s,t]}function c(t){return function(){return y&&y.config&&y.config[t]||{}}}var M,f,m,p,_={},d={},y={},g={},x=Object.prototype.hasOwnProperty,v=[].slice;m=function(t,s){var i,a=u(t),h=a[0];return t=a[1],h&&(h=e(h,s),i=l(h)),h?t=i&&i.normalize?i.normalize(t,r(s)):e(t,s):(t=e(t,s),a=u(t),h=a[0],t=a[1],h&&(i=l(h))),{f:h?h+"!"+t:t,n:t,pr:h,p:i}},p={require:function(t){return n(t)},exports:function(t){var s=_[t];return"undefined"!=typeof s?s:_[t]={}},module:function(t){return{id:t,uri:"",exports:_[t],config:c(t)}}},M=function(t,s,i,e){var r,u,c,M,f,y,x=[];if(e=e||t,"function"==typeof i){for(s=!s.length&&i.length?["require","exports","module"]:s,f=0;f<s.length;f+=1)if(M=m(s[f],e),u=M.f,"require"===u)x[f]=p.require(t);else if("exports"===u)x[f]=p.exports(t),y=!0;else if("module"===u)r=x[f]=p.module(t);else if(h(_,u)||h(d,u)||h(g,u))x[f]=l(u);else{if(!M.p)throw new Error(t+" missing "+u);M.p.load(M.n,n(e,!0),o(u),{}),x[f]=_[u]}c=i.apply(_[t],x),t&&(r&&r.exports!==a&&r.exports!==_[t]?_[t]=r.exports:c===a&&y||(_[t]=c))}else t&&(_[t]=i)},t=s=f=function(t,s,i,h,e){return"string"==typeof t?p[t]?p[t](s):l(m(t,s).f):(t.splice||(y=t,s.splice?(t=s,s=i,i=null):t=a),s=s||function(){},"function"==typeof i&&(i=h,h=e),h?M(a,t,s,i):setTimeout(function(){M(a,t,s,i)},4),f)},f.config=function(t){return y=t,y.deps&&f(y.deps,y.callback),f},t._defined=_,i=function(t,s,i){s.splice||(i=s,s=[]),h(_,t)||h(d,t)||(d[t]=[t,s,i])},i.amd={jQuery:!0}}(),i("node_modules/almond/almond",function(){}),i("proj4/mgrs",["require","exports","module"],function(t,s){function i(t){return t*(Math.PI/180)}function a(t){return 180*(t/Math.PI)}function h(t){var s,a,h,e,r,o,l,u,c,M=t.lat,f=t.lon,m=6378137,p=.00669438,_=.9996,d=i(M),y=i(f);c=Math.floor((f+180)/6)+1,180===f&&(c=60),M>=56&&64>M&&f>=3&&12>f&&(c=32),M>=72&&84>M&&(f>=0&&9>f?c=31:f>=9&&21>f?c=33:f>=21&&33>f?c=35:f>=33&&42>f&&(c=37)),s=6*(c-1)-180+3,u=i(s),a=p/(1-p),h=m/Math.sqrt(1-p*Math.sin(d)*Math.sin(d)),e=Math.tan(d)*Math.tan(d),r=a*Math.cos(d)*Math.cos(d),o=Math.cos(d)*(y-u),l=m*((1-p/4-3*p*p/64-5*p*p*p/256)*d-(3*p/8+3*p*p/32+45*p*p*p/1024)*Math.sin(2*d)+(15*p*p/256+45*p*p*p/1024)*Math.sin(4*d)-35*p*p*p/3072*Math.sin(6*d));var g=_*h*(o+(1-e+r)*o*o*o/6+(5-18*e+e*e+72*r-58*a)*o*o*o*o*o/120)+5e5,x=_*(l+h*Math.tan(d)*(o*o/2+(5-e+9*r+4*r*r)*o*o*o*o/24+(61-58*e+e*e+600*r-330*a)*o*o*o*o*o*o/720));return 0>M&&(x+=1e7),{northing:Math.round(x),easting:Math.round(g),zoneNumber:c,zoneLetter:n(M)}}function e(t){var s=t.northing,i=t.easting,h=t.zoneLetter,n=t.zoneNumber;if(0>n||n>60)return null;var r,o,l,u,c,M,f,m,p,_,d=.9996,y=6378137,g=.00669438,x=(1-Math.sqrt(1-g))/(1+Math.sqrt(1-g)),v=i-5e5,P=s;"N">h&&(P-=1e7),m=6*(n-1)-180+3,r=g/(1-g),f=P/d,p=f/(y*(1-g/4-3*g*g/64-5*g*g*g/256)),_=p+(3*x/2-27*x*x*x/32)*Math.sin(2*p)+(21*x*x/16-55*x*x*x*x/32)*Math.sin(4*p)+151*x*x*x/96*Math.sin(6*p),o=y/Math.sqrt(1-g*Math.sin(_)*Math.sin(_)),l=Math.tan(_)*Math.tan(_),u=r*Math.cos(_)*Math.cos(_),c=y*(1-g)/Math.pow(1-g*Math.sin(_)*Math.sin(_),1.5),M=v/(o*d);var b=_-o*Math.tan(_)/c*(M*M/2-(5+3*l+10*u-4*u*u-9*r)*M*M*M*M/24+(61+90*l+298*u+45*l*l-252*r-3*u*u)*M*M*M*M*M*M/720);b=a(b);var C=(M-(1+2*l+u)*M*M*M/6+(5-2*u+28*l-3*u*u+8*r+24*l*l)*M*M*M*M*M/120)/Math.cos(_);C=m+a(C);var S;if(t.accuracy){var j=e({northing:t.northing+t.accuracy,easting:t.easting+t.accuracy,zoneLetter:t.zoneLetter,zoneNumber:t.zoneNumber});S={top:j.lat,right:j.lon,bottom:b,left:C}}else S={lat:b,lon:C};return S}function n(t){var s="Z";return 84>=t&&t>=72?s="X":72>t&&t>=64?s="W":64>t&&t>=56?s="V":56>t&&t>=48?s="U":48>t&&t>=40?s="T":40>t&&t>=32?s="S":32>t&&t>=24?s="R":24>t&&t>=16?s="Q":16>t&&t>=8?s="P":8>t&&t>=0?s="N":0>t&&t>=-8?s="M":-8>t&&t>=-16?s="L":-16>t&&t>=-24?s="K":-24>t&&t>=-32?s="J":-32>t&&t>=-40?s="H":-40>t&&t>=-48?s="G":-48>t&&t>=-56?s="F":-56>t&&t>=-64?s="E":-64>t&&t>=-72?s="D":-72>t&&t>=-80&&(s="C"),s}function r(t,s){var i=""+t.easting,a=""+t.northing;return t.zoneNumber+t.zoneLetter+o(t.easting,t.northing,t.zoneNumber)+i.substr(i.length-5,s)+a.substr(a.length-5,s)}function o(t,s,i){var a=l(i),h=Math.floor(t/1e5),e=Math.floor(s/1e5)%20;return u(h,e,a)}function l(t){var s=t%p;return 0===s&&(s=p),s}function u(t,s,i){var a=i-1,h=_.charCodeAt(a),e=d.charCodeAt(a),n=h+t-1,r=e+s,o=!1;n>P&&(n=n-P+y-1,o=!0),(n===g||g>h&&n>g||(n>g||g>h)&&o)&&n++,(n===x||x>h&&n>x||(n>x||x>h)&&o)&&(n++,n===g&&n++),n>P&&(n=n-P+y-1),r>v?(r=r-v+y-1,o=!0):o=!1,(r===g||g>e&&r>g||(r>g||g>e)&&o)&&r++,(r===x||x>e&&r>x||(r>x||x>e)&&o)&&(r++,r===g&&r++),r>v&&(r=r-v+y-1);var l=String.fromCharCode(n)+String.fromCharCode(r);return l}function c(t){if(t&&0===t.length)throw"MGRSPoint coverting from nothing";for(var s,i=t.length,a=null,h="",e=0;!/[A-Z]/.test(s=t.charAt(e));){if(e>=2)throw"MGRSPoint bad conversion from: "+t;h+=s,e++}var n=parseInt(h,10);if(0===e||e+3>i)throw"MGRSPoint bad conversion from: "+t;var r=t.charAt(e++);if("A">=r||"B"===r||"Y"===r||r>="Z"||"I"===r||"O"===r)throw"MGRSPoint zone letter "+r+" not handled: "+t;a=t.substring(e,e+=2);for(var o=l(n),u=M(a.charAt(0),o),c=f(a.charAt(1),o);c<m(r);)c+=2e6;var p=i-e;if(0!==p%2)throw"MGRSPoint has to have an even number \nof digits after the zone letter and two 100km letters - front \nhalf for easting meters, second half for \nnorthing meters"+t;var _,d,y,g,x,v=p/2,P=0,b=0;return v>0&&(_=1e5/Math.pow(10,v),d=t.substring(e,e+v),P=parseFloat(d)*_,y=t.substring(e+v),b=parseFloat(y)*_),g=P+u,x=b+c,{easting:g,northing:x,zoneLetter:r,zoneNumber:n,accuracy:_}}function M(t,s){for(var i=_.charCodeAt(s-1),a=1e5,h=!1;i!==t.charCodeAt(0);){if(i++,i===g&&i++,i===x&&i++,i>P){if(h)throw"Bad character: "+t;i=y,h=!0}a+=1e5}return a}function f(t,s){if(t>"V")throw"MGRSPoint given invalid Northing "+t;for(var i=d.charCodeAt(s-1),a=0,h=!1;i!==t.charCodeAt(0);){if(i++,i===g&&i++,i===x&&i++,i>v){if(h)throw"Bad character: "+t;i=y,h=!0}a+=1e5}return a}function m(t){var s;switch(t){case"C":s=11e5;break;case"D":s=2e6;break;case"E":s=28e5;break;case"F":s=37e5;break;case"G":s=46e5;break;case"H":s=55e5;break;case"J":s=64e5;break;case"K":s=73e5;break;case"L":s=82e5;break;case"M":s=91e5;break;case"N":s=0;break;case"P":s=8e5;break;case"Q":s=17e5;break;case"R":s=26e5;break;case"S":s=35e5;break;case"T":s=44e5;break;case"U":s=53e5;break;case"V":s=62e5;break;case"W":s=7e6;break;case"X":s=79e5;break;default:s=-1}if(s>=0)return s;throw"Invalid zone letter: "+t}var p=6,_="AJSAJS",d="AFAFAF",y=65,g=73,x=79,v=86,P=90;s.forward=function(t,s){return s=s||5,r(h({lat:t.lat,lon:t.lon}),s)},s.inverse=function(t){var s=e(c(t.toUpperCase()));return[s.left,s.bottom,s.right,s.top]}}),i("proj4/Point",["./mgrs"],function(t){function s(t,i,a){if(!(this instanceof s))return new s(t,i,a);if("object"==typeof t)this.x=t[0],this.y=t[1],this.z=t[2]||0;else if("string"==typeof t&&"undefined"==typeof i){var h=t.split(",");this.x=parseFloat(h[0]),this.y=parseFloat(h[1]),this.z=parseFloat(h[2])||0}else this.x=t,this.y=i,this.z=a||0;this.clone=function(){return new s(this.x,this.y,this.z)},this.toString=function(){return"x="+this.x+",y="+this.y},this.toShortString=function(){return this.x+", "+this.y}}return s.fromMGRS=function(i){var a=t.inverse(i);return new s((a[2]+a[0])/2,(a[3]+a[1])/2)},s.prototype.toMGRS=function(s){return t.forward({lon:this.x,lat:this.y},s)},s}),i("proj4/extend",[],function(){return function(t,s){t=t||{};var i,a;if(!s)return t;for(a in s)i=s[a],void 0!==i&&(t[a]=i);return t}}),i("proj4/common",[],function(){var t={PI:3.141592653589793,HALF_PI:1.5707963267948966,TWO_PI:6.283185307179586,FORTPI:.7853981633974483,R2D:57.29577951308232,D2R:.017453292519943295,SEC_TO_RAD:484813681109536e-20,EPSLN:1e-10,MAX_ITER:20,COS_67P5:.3826834323650898,AD_C:1.0026,PJD_UNKNOWN:0,PJD_3PARAM:1,PJD_7PARAM:2,PJD_GRIDSHIFT:3,PJD_WGS84:4,PJD_NODATUM:5,SRS_WGS84_SEMIMAJOR:6378137,SRS_WGS84_ESQUARED:.006694379990141316,SIXTH:.16666666666666666,RA4:.04722222222222222,RA6:.022156084656084655,RV4:.06944444444444445,RV6:.04243827160493827,msfnz:function(t,s,i){var a=t*s;return i/Math.sqrt(1-a*a)},tsfnz:function(t,s,i){var a=t*i,h=.5*t;return a=Math.pow((1-a)/(1+a),h),Math.tan(.5*(this.HALF_PI-s))/a},phi2z:function(t,s){for(var i,a,h=.5*t,e=this.HALF_PI-2*Math.atan(s),n=0;15>=n;n++)if(i=t*Math.sin(e),a=this.HALF_PI-2*Math.atan(s*Math.pow((1-i)/(1+i),h))-e,e+=a,Math.abs(a)<=1e-10)return e;return-9999},qsfnz:function(t,s){var i;return t>1e-7?(i=t*s,(1-t*t)*(s/(1-i*i)-.5/t*Math.log((1-i)/(1+i)))):2*s},iqsfnz:function(s,i){var a=1-(1-s*s)/(2*s)*Math.log((1-s)/(1+s));if(Math.abs(Math.abs(i)-a)<1e-6)return 0>i?-1*t.HALF_PI:t.HALF_PI;for(var h,e,n,r,o=Math.asin(.5*i),l=0;30>l;l++)if(e=Math.sin(o),n=Math.cos(o),r=s*e,h=Math.pow(1-r*r,2)/(2*n)*(i/(1-s*s)-e/(1-r*r)+.5/s*Math.log((1-r)/(1+r))),o+=h,Math.abs(h)<=1e-10)return o;return 0/0},asinz:function(t){return Math.abs(t)>1&&(t=t>1?1:-1),Math.asin(t)},e0fn:function(t){return 1-.25*t*(1+t/16*(3+1.25*t))},e1fn:function(t){return.375*t*(1+.25*t*(1+.46875*t))},e2fn:function(t){return.05859375*t*t*(1+.75*t)},e3fn:function(t){return t*t*t*(35/3072)},mlfn:function(t,s,i,a,h){return t*h-s*Math.sin(2*h)+i*Math.sin(4*h)-a*Math.sin(6*h)},imlfn:function(t,s,i,a,h){var e,n;e=t/s;for(var r=0;15>r;r++)if(n=(t-(s*e-i*Math.sin(2*e)+a*Math.sin(4*e)-h*Math.sin(6*e)))/(s-2*i*Math.cos(2*e)+4*a*Math.cos(4*e)-6*h*Math.cos(6*e)),e+=n,Math.abs(n)<=1e-10)return e;return 0/0},srat:function(t,s){return Math.pow((1-t)/(1+t),s)},sign:function(t){return 0>t?-1:1},adjust_lon:function(t){return t=Math.abs(t)<this.PI?t:t-this.sign(t)*this.TWO_PI},adjust_lat:function(t){return t=Math.abs(t)<this.HALF_PI?t:t-this.sign(t)*this.PI},latiso:function(t,s,i){if(Math.abs(s)>this.HALF_PI)return Number.NaN;if(s===this.HALF_PI)return Number.POSITIVE_INFINITY;if(s===-1*this.HALF_PI)return Number.NEGATIVE_INFINITY;var a=t*i;return Math.log(Math.tan((this.HALF_PI+s)/2))+t*Math.log((1-a)/(1+a))/2},fL:function(t,s){return 2*Math.atan(t*Math.exp(s))-this.HALF_PI},invlatiso:function(t,s){var i=this.fL(1,s),a=0,h=0;do a=i,h=t*Math.sin(a),i=this.fL(Math.exp(t*Math.log((1+h)/(1-h))/2),s);while(Math.abs(i-a)>1e-12);return i},sinh:function(t){var s=Math.exp(t);return s=(s-1/s)/2},cosh:function(t){var s=Math.exp(t);return s=(s+1/s)/2},tanh:function(t){var s=Math.exp(t);return s=(s-1/s)/(s+1/s)},asinh:function(t){var s=t>=0?1:-1;return s*Math.log(Math.abs(t)+Math.sqrt(t*t+1))},acosh:function(t){return 2*Math.log(Math.sqrt((t+1)/2)+Math.sqrt((t-1)/2))},atanh:function(t){return Math.log((t-1)/(t+1))/2},gN:function(t,s,i){var a=s*i;return t/Math.sqrt(1-a*a)},pj_enfn:function(t){var s=[];s[0]=this.C00-t*(this.C02+t*(this.C04+t*(this.C06+t*this.C08))),s[1]=t*(this.C22-t*(this.C04+t*(this.C06+t*this.C08)));var i=t*t;return s[2]=i*(this.C44-t*(this.C46+t*this.C48)),i*=t,s[3]=i*(this.C66-t*this.C68),s[4]=i*t*this.C88,s},pj_mlfn:function(t,s,i,a){return i*=s,s*=s,a[0]*t-i*(a[1]+s*(a[2]+s*(a[3]+s*a[4])))},pj_inv_mlfn:function(s,i,a){for(var h=1/(1-i),e=s,n=t.MAX_ITER;n;--n){var r=Math.sin(e),o=1-i*r*r;if(o=(this.pj_mlfn(e,r,Math.cos(e),a)-s)*o*Math.sqrt(o)*h,e-=o,Math.abs(o)<t.EPSLN)return e}return e},nad_intr:function(t,s){var i,a={x:(t.x-1e-7)/s.del[0],y:(t.y-1e-7)/s.del[1]},h={x:Math.floor(a.x),y:Math.floor(a.y)},e={x:a.x-1*h.x,y:a.y-1*h.y},n={x:Number.NaN,y:Number.NaN};if(h.x<0){if(!(-1===h.x&&e.x>.99999999999))return n;h.x++,e.x=0}else if(i=h.x+1,i>=s.lim[0]){if(!(i===s.lim[0]&&e.x<1e-11))return n;h.x--,e.x=1}if(h.y<0){if(!(-1===h.y&&e.y>.99999999999))return n;h.y++,e.y=0}else if(i=h.y+1,i>=s.lim[1]){if(!(i===s.lim[1]&&e.y<1e-11))return n;h.y++,e.y=1}i=h.y*s.lim[0]+h.x;var r={x:s.cvs[i][0],y:s.cvs[i][1]};i++;var o={x:s.cvs[i][0],y:s.cvs[i][1]};i+=s.lim[0];var l={x:s.cvs[i][0],y:s.cvs[i][1]};i--;var u={x:s.cvs[i][0],y:s.cvs[i][1]},c=e.x*e.y,M=e.x*(1-e.y),f=(1-e.x)*(1-e.y),m=(1-e.x)*e.y;return n.x=f*r.x+M*o.x+m*u.x+c*l.x,n.y=f*r.y+M*o.y+m*u.y+c*l.y,n},nad_cvt:function(s,i,a){var h={x:Number.NaN,y:Number.NaN};if(isNaN(s.x))return h;var e={x:s.x,y:s.y};e.x-=a.ll[0],e.y-=a.ll[1],e.x=t.adjust_lon(e.x-t.PI)+t.PI;var n=t.nad_intr(e,a);if(i){if(isNaN(n.x))return h;n.x=e.x+n.x,n.y=e.y-n.y;var r,o,l=9,u=1e-12;do{if(o=t.nad_intr(n,a),isNaN(o.x)){this.reportError("Inverse grid shift iteration failed, presumably at grid edge.  Using first approximation.");break}r={x:n.x-o.x-e.x,y:n.y+o.y-e.y},n.x-=r.x,n.y-=r.y}while(l--&&Math.abs(r.x)>u&&Math.abs(r.y)>u);if(0>l)return this.reportError("Inverse grid shift iterator failed to converge."),h;h.x=t.adjust_lon(n.x+a.ll[0]),h.y=n.y+a.ll[1]}else isNaN(n.x)||(h.x=s.x-n.x,h.y=s.y+n.y);return h},C00:1,C02:.25,C04:.046875,C06:.01953125,C08:.01068115234375,C22:.75,C44:.46875,C46:.013020833333333334,C48:.007120768229166667,C66:.3645833333333333,C68:.005696614583333333,C88:.3076171875};return t}),i("proj4/constants",[],function(){var t={};return t.PrimeMeridian={greenwich:0,lisbon:-9.131906111111,paris:2.337229166667,bogota:-74.080916666667,madrid:-3.687938888889,rome:12.452333333333,bern:7.439583333333,jakarta:106.807719444444,ferro:-17.666666666667,brussels:4.367975,stockholm:18.058277777778,athens:23.7163375,oslo:10.722916666667},t.Ellipsoid={MERIT:{a:6378137,rf:298.257,ellipseName:"MERIT 1983"},SGS85:{a:6378136,rf:298.257,ellipseName:"Soviet Geodetic System 85"},GRS80:{a:6378137,rf:298.257222101,ellipseName:"GRS 1980(IUGG, 1980)"},IAU76:{a:6378140,rf:298.257,ellipseName:"IAU 1976"},airy:{a:6377563.396,b:6356256.91,ellipseName:"Airy 1830"},"APL4.":{a:6378137,rf:298.25,ellipseName:"Appl. Physics. 1965"},NWL9D:{a:6378145,rf:298.25,ellipseName:"Naval Weapons Lab., 1965"},mod_airy:{a:6377340.189,b:6356034.446,ellipseName:"Modified Airy"},andrae:{a:6377104.43,rf:300,ellipseName:"Andrae 1876 (Den., Iclnd.)"},aust_SA:{a:6378160,rf:298.25,ellipseName:"Australian Natl & S. Amer. 1969"},GRS67:{a:6378160,rf:298.247167427,ellipseName:"GRS 67(IUGG 1967)"},bessel:{a:6377397.155,rf:299.1528128,ellipseName:"Bessel 1841"},bess_nam:{a:6377483.865,rf:299.1528128,ellipseName:"Bessel 1841 (Namibia)"},clrk66:{a:6378206.4,b:6356583.8,ellipseName:"Clarke 1866"},clrk80:{a:6378249.145,rf:293.4663,ellipseName:"Clarke 1880 mod."},clrk58:{a:6378293.645208759,rf:294.2606763692654,ellipseName:"Clarke 1858"},CPM:{a:6375738.7,rf:334.29,ellipseName:"Comm. des Poids et Mesures 1799"},delmbr:{a:6376428,rf:311.5,ellipseName:"Delambre 1810 (Belgium)"},engelis:{a:6378136.05,rf:298.2566,ellipseName:"Engelis 1985"},evrst30:{a:6377276.345,rf:300.8017,ellipseName:"Everest 1830"},evrst48:{a:6377304.063,rf:300.8017,ellipseName:"Everest 1948"},evrst56:{a:6377301.243,rf:300.8017,ellipseName:"Everest 1956"},evrst69:{a:6377295.664,rf:300.8017,ellipseName:"Everest 1969"},evrstSS:{a:6377298.556,rf:300.8017,ellipseName:"Everest (Sabah & Sarawak)"},fschr60:{a:6378166,rf:298.3,ellipseName:"Fischer (Mercury Datum) 1960"},fschr60m:{a:6378155,rf:298.3,ellipseName:"Fischer 1960"},fschr68:{a:6378150,rf:298.3,ellipseName:"Fischer 1968"},helmert:{a:6378200,rf:298.3,ellipseName:"Helmert 1906"},hough:{a:6378270,rf:297,ellipseName:"Hough"},intl:{a:6378388,rf:297,ellipseName:"International 1909 (Hayford)"},kaula:{a:6378163,rf:298.24,ellipseName:"Kaula 1961"},lerch:{a:6378139,rf:298.257,ellipseName:"Lerch 1979"},mprts:{a:6397300,rf:191,ellipseName:"Maupertius 1738"},new_intl:{a:6378157.5,b:6356772.2,ellipseName:"New International 1967"},plessis:{a:6376523,rf:6355863,ellipseName:"Plessis 1817 (France)"},krass:{a:6378245,rf:298.3,ellipseName:"Krassovsky, 1942"},SEasia:{a:6378155,b:6356773.3205,ellipseName:"Southeast Asia"},walbeck:{a:6376896,b:6355834.8467,ellipseName:"Walbeck"},WGS60:{a:6378165,rf:298.3,ellipseName:"WGS 60"},WGS66:{a:6378145,rf:298.25,ellipseName:"WGS 66"},WGS72:{a:6378135,rf:298.26,ellipseName:"WGS 72"},WGS84:{a:6378137,rf:298.257223563,ellipseName:"WGS 84"},sphere:{a:6370997,b:6370997,ellipseName:"Normal Sphere (r=6370997)"}},t.Datum={wgs84:{towgs84:"0,0,0",ellipse:"WGS84",datumName:"WGS84"},ch1903:{towgs84:"674.374,15.056,405.346",ellipse:"bessel",datumName:"swiss"},ggrs87:{towgs84:"-199.87,74.79,246.62",ellipse:"GRS80",datumName:"Greek_Geodetic_Reference_System_1987"},nad83:{towgs84:"0,0,0",ellipse:"GRS80",datumName:"North_American_Datum_1983"},nad27:{nadgrids:"@conus,@alaska,@ntv2_0.gsb,@ntv1_can.dat",ellipse:"clrk66",datumName:"North_American_Datum_1927"},potsdam:{towgs84:"606.0,23.0,413.0",ellipse:"bessel",datumName:"Potsdam Rauenberg 1950 DHDN"},carthage:{towgs84:"-263.0,6.0,431.0",ellipse:"clark80",datumName:"Carthage 1934 Tunisia"},hermannskogel:{towgs84:"653.0,-212.0,449.0",ellipse:"bessel",datumName:"Hermannskogel"},ire65:{towgs84:"482.530,-130.596,564.557,-1.042,-0.214,-0.631,8.15",ellipse:"mod_airy",datumName:"Ireland 1965"},rassadiran:{towgs84:"-133.63,-157.5,-158.62",ellipse:"intl",datumName:"Rassadiran"},nzgd49:{towgs84:"59.47,-5.04,187.44,0.47,-0.1,1.024,-4.5993",ellipse:"intl",datumName:"New Zealand Geodetic Datum 1949"},osgb36:{towgs84:"446.448,-125.157,542.060,0.1502,0.2470,0.8421,-20.4894",ellipse:"airy",datumName:"Airy 1830"},s_jtsk:{towgs84:"589,76,480",ellipse:"bessel",datumName:"S-JTSK (Ferro)"},beduaram:{towgs84:"-106,-87,188",ellipse:"clrk80",datumName:"Beduaram"},gunung_segara:{towgs84:"-403,684,41",ellipse:"bessel",datumName:"Gunung Segara Jakarta"}},t.Datum.OSB36=t.Datum.OSGB36,t.wktProjections={"Lambert Tangential Conformal Conic Projection":"lcc",Lambert_Conformal_Conic:"lcc",Lambert_Conformal_Conic_2SP:"lcc",Mercator:"merc","Popular Visualisation Pseudo Mercator":"merc",Mercator_1SP:"merc",Transverse_Mercator:"tmerc","Transverse Mercator":"tmerc","Lambert Azimuthal Equal Area":"laea","Universal Transverse Mercator System":"utm",Hotine_Oblique_Mercator:"omerc","Hotine Oblique Mercator":"omerc",Hotine_Oblique_Mercator_Azimuth_Natural_Origin:"omerc",Hotine_Oblique_Mercator_Azimuth_Center:"omerc",Van_der_Grinten_I:"vandg",VanDerGrinten:"vandg",Stereographic_North_Pole:"sterea",Oblique_Stereographic:"sterea",Polar_Stereographic:"sterea",Polyconic:"poly",New_Zealand_Map_Grid:"nzmg",Miller_Cylindrical:"mill",Krovak:"krovak",Equirectangular:"eqc",Equidistant_Cylindrical:"eqc",Cassini:"cass",Cassini_Soldner:"cass",Azimuthal_Equidistant:"aeqd",Albers_Conic_Equal_Area:"aea",Albers:"aea",Mollweide:"moll",Lambert_Azimuthal_Equal_Area:"laea",Sinusoidal:"sinu",Equidistant_Conic:"eqdc",Mercator_Auxiliary_Sphere:"merc"},t.grids={"null":{ll:[-3.14159265,-1.57079633],del:[3.14159265,1.57079633],lim:[3,3],count:9,cvs:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]]}},t}),i("proj4/global",[],function(){return function(t){t("WGS84","+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees"),t("EPSG:4326","+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees"),t("EPSG:4269","+title=NAD83 (long/lat) +proj=longlat +a=6378137.0 +b=6356752.31414036 +ellps=GRS80 +datum=NAD83 +units=degrees"),t("EPSG:3857","+title=WGS 84 / Pseudo-Mercator +proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs"),t["EPSG:3785"]=t["EPSG:3857"],t.GOOGLE=t["EPSG:3857"],t["EPSG:900913"]=t["EPSG:3857"],t["EPSG:102113"]=t["EPSG:3857"]}}),i("proj4/projString",["./common","./constants"],function(t,s){return function(i){var a={},h={};i.split("+").map(function(t){return t.trim()}).filter(function(t){return t}).forEach(function(t){var s=t.split("=");"@null"!==s[1]&&(s.push(!0),h[s[0].toLowerCase()]=s[1])});var e,n,r,o={proj:"projName",datum:"datumCode",rf:function(t){a.rf=parseFloat(t,10)},lat_0:function(s){a.lat0=s*t.D2R},lat_1:function(s){a.lat1=s*t.D2R},lat_2:function(s){a.lat2=s*t.D2R},lat_ts:function(s){a.lat_ts=s*t.D2R},lon_0:function(s){a.long0=s*t.D2R},lon_1:function(s){a.long1=s*t.D2R},lon_2:function(s){a.long2=s*t.D2R},alpha:function(s){a.alpha=parseFloat(s)*t.D2R},lonc:function(s){a.longc=s*t.D2R},x_0:function(t){a.x0=parseFloat(t,10)},y_0:function(t){a.y0=parseFloat(t,10)},k_0:function(t){a.k0=parseFloat(t,10)},k:function(t){a.k0=parseFloat(t,10)},r_a:function(){a.R_A=!0},zone:function(t){a.zone=parseInt(t,10)},south:function(){a.utmSouth=!0},towgs84:function(t){a.datum_params=t.split(",").map(function(t){return parseFloat(t,10)})},to_meter:function(t){a.to_meter=parseFloat(t,10)},from_greenwich:function(s){a.from_greenwich=s*t.D2R},pm:function(i){a.from_greenwich=(s.PrimeMeridian[i]?s.PrimeMeridian[i]:parseFloat(i,10))*t.D2R},axis:function(t){var s="ewnsud";3===t.length&&-1!==s.indexOf(t.substr(0,1))&&-1!==s.indexOf(t.substr(1,1))&&-1!==s.indexOf(t.substr(2,1))&&(a.axis=t)}};for(e in h)n=h[e],e in o?(r=o[e],"function"==typeof r?r(n):a[r]=n):a[e]=n;return a}}),i("proj4/wkt",["./extend","./constants","./common"],function(t,s,i){function a(s,i,a){s[i]=a.map(function(t){var s={};return h(t,s),s}).reduce(function(s,i){return t(s,i)},{})}function h(t,s){var i;return Array.isArray(t)?(i=t.shift(),"PARAMETER"===i&&(i=t.shift()),1===t.length?Array.isArray(t[0])?(s[i]={},h(t[0],s[i])):s[i]=t[0]:t.length?"TOWGS84"===i?s[i]=t:(s[i]={},["UNIT","PRIMEM","VERT_DATUM"].indexOf(i)>-1?(s[i]={name:t[0].toLowerCase(),convert:t[1]},3===t.length&&(s[i].auth=t[2])):"SPHEROID"===i?(s[i]={name:t[0],a:t[1],rf:t[2]},4===t.length&&(s[i].auth=t[3])):["GEOGCS","GEOCCS","DATUM","VERT_CS","COMPD_CS","LOCAL_CS","FITTED_CS","LOCAL_DATUM"].indexOf(i)>-1?(t[0]=["name",t[0]],a(s,i,t)):t.every(function(t){return Array.isArray(t)})?a(s,i,t):h(t,s[i])):s[i]=!0,void 0):(s[t]=!0,void 0)}function e(t,s){var i=s[0],a=s[1];!(i in t)&&a in t&&(t[i]=t[a],3===s.length&&(t[i]=s[2](t[i])))}function n(t){return t*i.D2R}function r(t){function i(s){var i=t.to_meter||1;return parseFloat(s,10)*i}"GEOGCS"===t.type?t.projName="longlat":"LOCAL_CS"===t.type?(t.projName="identity",t.local=!0):t.projName=s.wktProjections[t.PROJECTION],t.UNIT&&(t.units=t.UNIT.name.toLowerCase(),"metre"===t.units&&(t.units="meter"),t.UNIT.convert&&(t.to_meter=parseFloat(t.UNIT.convert,10))),t.GEOGCS&&(t.datumCode=t.GEOGCS.DATUM?t.GEOGCS.DATUM.name.toLowerCase():t.GEOGCS.name.toLowerCase(),"d_"===t.datumCode.slice(0,2)&&(t.datumCode=t.datumCode.slice(2)),("new_zealand_geodetic_datum_1949"===t.datumCode||"new_zealand_1949"===t.datumCode)&&(t.datumCode="nzgd49"),"wgs_1984"===t.datumCode&&("Mercator_Auxiliary_Sphere"===t.PROJECTION&&(t.sphere=!0),t.datumCode="wgs84"),"_ferro"===t.datumCode.slice(-6)&&(t.datumCode=t.datumCode.slice(0,-6)),"_jakarta"===t.datumCode.slice(-8)&&(t.datumCode=t.datumCode.slice(0,-8)),t.GEOGCS.DATUM&&t.GEOGCS.DATUM.SPHEROID&&(t.ellps=t.GEOGCS.DATUM.SPHEROID.name.replace("_19","").replace(/[Cc]larke\_18/,"clrk"),"international"===t.ellps.toLowerCase().slice(0,13)&&(t.ellps="intl"),t.a=t.GEOGCS.DATUM.SPHEROID.a,t.rf=parseFloat(t.GEOGCS.DATUM.SPHEROID.rf,10))),t.b&&!isFinite(t.b)&&(t.b=t.a);var a=function(s){return e(t,s)},h=[["standard_parallel_1","Standard_Parallel_1"],["standard_parallel_2","Standard_Parallel_2"],["false_easting","False_Easting"],["false_northing","False_Northing"],["central_meridian","Central_Meridian"],["latitude_of_origin","Latitude_Of_Origin"],["scale_factor","Scale_Factor"],["k0","scale_factor"],["latitude_of_center","Latitude_of_center"],["lat0","latitude_of_center",n],["longitude_of_center","Longitude_Of_Center"],["longc","longitude_of_center",n],["x0","false_easting",i],["y0","false_northing",i],["long0","central_meridian",n],["lat0","latitude_of_origin",n],["lat0","standard_parallel_1",n],["lat1","standard_parallel_1",n],["lat2","standard_parallel_2",n],["alpha","azimuth",n],["srsCode","name"]];h.forEach(a),t.long0||!t.longc||"Albers_Conic_Equal_Area"!==t.PROJECTION&&"Lambert_Azimuthal_Equal_Area"!==t.PROJECTION||(t.long0=t.longc)}return function(s,i){var a=JSON.parse((","+s).replace(/\,([A-Z_0-9]+?)(\[)/g,',["$1",').slice(1).replace(/\,([A-Z_0-9]+?)\]/g,',"$1"]')),e=a.shift(),n=a.shift();a.unshift(["name",n]),a.unshift(["type",e]),a.unshift("output");var o={};return h(a,o),r(o.output),t(i,o.output)}}),i("proj4/defs",["./common","./constants","./global","./projString","./wkt"],function(t,s,i,a,h){function e(t){var s=this;if(2===arguments.length)e[t]="+"===arguments[1][0]?a(arguments[1]):h(arguments[1]);else if(1===arguments.length)return Array.isArray(t)?t.map(function(t){Array.isArray(t)?e.apply(s,t):e(t)}):("string"==typeof t||("EPSG"in t?e["EPSG:"+t.EPSG]=t:"ESRI"in t?e["ESRI:"+t.ESRI]=t:"IAU2000"in t?e["IAU2000:"+t.IAU2000]=t:console.log(t)),void 0)}return i(e),e}),i("proj4/datum",["./common"],function(t){var s=function(i){if(!(this instanceof s))return new s(i);if(this.datum_type=t.PJD_WGS84,i){if(i.datumCode&&"none"===i.datumCode&&(this.datum_type=t.PJD_NODATUM),i.datum_params){for(var a=0;a<i.datum_params.length;a++)i.datum_params[a]=parseFloat(i.datum_params[a]);(0!==i.datum_params[0]||0!==i.datum_params[1]||0!==i.datum_params[2])&&(this.datum_type=t.PJD_3PARAM),i.datum_params.length>3&&(0!==i.datum_params[3]||0!==i.datum_params[4]||0!==i.datum_params[5]||0!==i.datum_params[6])&&(this.datum_type=t.PJD_7PARAM,i.datum_params[3]*=t.SEC_TO_RAD,i.datum_params[4]*=t.SEC_TO_RAD,i.datum_params[5]*=t.SEC_TO_RAD,i.datum_params[6]=i.datum_params[6]/1e6+1)}this.datum_type=i.grids?t.PJD_GRIDSHIFT:this.datum_type,this.a=i.a,this.b=i.b,this.es=i.es,this.ep2=i.ep2,this.datum_params=i.datum_params,this.datum_type===t.PJD_GRIDSHIFT&&(this.grids=i.grids)}};return s.prototype={compare_datums:function(s){return this.datum_type!==s.datum_type?!1:this.a!==s.a||Math.abs(this.es-s.es)>5e-11?!1:this.datum_type===t.PJD_3PARAM?this.datum_params[0]===s.datum_params[0]&&this.datum_params[1]===s.datum_params[1]&&this.datum_params[2]===s.datum_params[2]:this.datum_type===t.PJD_7PARAM?this.datum_params[0]===s.datum_params[0]&&this.datum_params[1]===s.datum_params[1]&&this.datum_params[2]===s.datum_params[2]&&this.datum_params[3]===s.datum_params[3]&&this.datum_params[4]===s.datum_params[4]&&this.datum_params[5]===s.datum_params[5]&&this.datum_params[6]===s.datum_params[6]:this.datum_type===t.PJD_GRIDSHIFT||s.datum_type===t.PJD_GRIDSHIFT?this.nadgrids===s.nadgrids:!0},geodetic_to_geocentric:function(s){var i,a,h,e,n,r,o,l=s.x,u=s.y,c=s.z?s.z:0,M=0;if(u<-t.HALF_PI&&u>-1.001*t.HALF_PI)u=-t.HALF_PI;else if(u>t.HALF_PI&&u<1.001*t.HALF_PI)u=t.HALF_PI;else if(u<-t.HALF_PI||u>t.HALF_PI)return null;return l>t.PI&&(l-=2*t.PI),n=Math.sin(u),o=Math.cos(u),r=n*n,e=this.a/Math.sqrt(1-this.es*r),i=(e+c)*o*Math.cos(l),a=(e+c)*o*Math.sin(l),h=(e*(1-this.es)+c)*n,s.x=i,s.y=a,s.z=h,M},geocentric_to_geodetic:function(s){var i,a,h,e,n,r,o,l,u,c,M,f,m,p,_,d,y,g=1e-12,x=g*g,v=30,P=s.x,b=s.y,C=s.z?s.z:0;if(m=!1,i=Math.sqrt(P*P+b*b),a=Math.sqrt(P*P+b*b+C*C),i/this.a<g){if(m=!0,_=0,a/this.a<g)return d=t.HALF_PI,y=-this.b,void 0}else _=Math.atan2(b,P);h=C/a,e=i/a,n=1/Math.sqrt(1-this.es*(2-this.es)*e*e),l=e*(1-this.es)*n,u=h*n,p=0;do p++,o=this.a/Math.sqrt(1-this.es*u*u),y=i*l+C*u-o*(1-this.es*u*u),r=this.es*o/(o+y),n=1/Math.sqrt(1-r*(2-r)*e*e),c=e*(1-r)*n,M=h*n,f=M*l-c*u,l=c,u=M;while(f*f>x&&v>p);return d=Math.atan(M/Math.abs(c)),s.x=_,s.y=d,s.z=y,s},geocentric_to_geodetic_noniter:function(s){var i,a,h,e,n,r,o,l,u,c,M,f,m,p,_,d,y,g=s.x,x=s.y,v=s.z?s.z:0;if(g=parseFloat(g),x=parseFloat(x),v=parseFloat(v),y=!1,0!==g)i=Math.atan2(x,g);else if(x>0)i=t.HALF_PI;else if(0>x)i=-t.HALF_PI;else if(y=!0,i=0,v>0)a=t.HALF_PI;else{if(!(0>v))return a=t.HALF_PI,h=-this.b,void 0;a=-t.HALF_PI}return n=g*g+x*x,e=Math.sqrt(n),r=v*t.AD_C,l=Math.sqrt(r*r+n),c=r/l,f=e/l,M=c*c*c,o=v+this.b*this.ep2*M,d=e-this.a*this.es*f*f*f,u=Math.sqrt(o*o+d*d),m=o/u,p=d/u,_=this.a/Math.sqrt(1-this.es*m*m),h=p>=t.COS_67P5?e/p-_:p<=-t.COS_67P5?e/-p-_:v/m+_*(this.es-1),y===!1&&(a=Math.atan(m/p)),s.x=i,s.y=a,s.z=h,s},geocentric_to_wgs84:function(s){if(this.datum_type===t.PJD_3PARAM)s.x+=this.datum_params[0],s.y+=this.datum_params[1],s.z+=this.datum_params[2];else if(this.datum_type===t.PJD_7PARAM){var i=this.datum_params[0],a=this.datum_params[1],h=this.datum_params[2],e=this.datum_params[3],n=this.datum_params[4],r=this.datum_params[5],o=this.datum_params[6],l=o*(s.x-r*s.y+n*s.z)+i,u=o*(r*s.x+s.y-e*s.z)+a,c=o*(-n*s.x+e*s.y+s.z)+h;s.x=l,s.y=u,s.z=c}},geocentric_from_wgs84:function(s){if(this.datum_type===t.PJD_3PARAM)s.x-=this.datum_params[0],s.y-=this.datum_params[1],s.z-=this.datum_params[2];else if(this.datum_type===t.PJD_7PARAM){var i=this.datum_params[0],a=this.datum_params[1],h=this.datum_params[2],e=this.datum_params[3],n=this.datum_params[4],r=this.datum_params[5],o=this.datum_params[6],l=(s.x-i)/o,u=(s.y-a)/o,c=(s.z-h)/o;s.x=l+r*u-n*c,s.y=-r*l+u+e*c,s.z=n*l-e*u+c}}},s}),i("proj4/projCode/longlat",["require","exports","module"],function(t,s){function i(t){return t}s.init=function(){},s.forward=i,s.inverse=i}),i("proj4/projCode/tmerc",["../common"],function(t){return{init:function(){this.e0=t.e0fn(this.es),this.e1=t.e1fn(this.es),this.e2=t.e2fn(this.es),this.e3=t.e3fn(this.es),this.ml0=this.a*t.mlfn(this.e0,this.e1,this.e2,this.e3,this.lat0)},forward:function(s){var i,a,h,e=s.x,n=s.y,r=t.adjust_lon(e-this.long0),o=Math.sin(n),l=Math.cos(n);if(this.sphere){var u=l*Math.sin(r);if(Math.abs(Math.abs(u)-1)<1e-10)return 93;a=.5*this.a*this.k0*Math.log((1+u)/(1-u)),i=Math.acos(l*Math.cos(r)/Math.sqrt(1-u*u)),0>n&&(i=-i),h=this.a*this.k0*(i-this.lat0)}else{var c=l*r,M=Math.pow(c,2),f=this.ep2*Math.pow(l,2),m=Math.tan(n),p=Math.pow(m,2);i=1-this.es*Math.pow(o,2);var _=this.a/Math.sqrt(i),d=this.a*t.mlfn(this.e0,this.e1,this.e2,this.e3,n);a=this.k0*_*c*(1+M/6*(1-p+f+M/20*(5-18*p+Math.pow(p,2)+72*f-58*this.ep2)))+this.x0,h=this.k0*(d-this.ml0+_*m*M*(.5+M/24*(5-p+9*f+4*Math.pow(f,2)+M/30*(61-58*p+Math.pow(p,2)+600*f-330*this.ep2))))+this.y0}return s.x=a,s.y=h,s},inverse:function(s){var i,a,h,e,n,r,o=6;if(this.sphere){var l=Math.exp(s.x/(this.a*this.k0)),u=.5*(l-1/l),c=this.lat0+s.y/(this.a*this.k0),M=Math.cos(c);i=Math.sqrt((1-M*M)/(1+u*u)),n=t.asinz(i),0>c&&(n=-n),r=0===u&&0===M?this.long0:t.adjust_lon(Math.atan2(u,M)+this.long0)}else{var f=s.x-this.x0,m=s.y-this.y0;for(i=(this.ml0+m/this.k0)/this.a,a=i,e=0;!0&&(h=(i+this.e1*Math.sin(2*a)-this.e2*Math.sin(4*a)+this.e3*Math.sin(6*a))/this.e0-a,a+=h,!(Math.abs(h)<=t.EPSLN));e++)if(e>=o)return 95;if(Math.abs(a)<t.HALF_PI){var p=Math.sin(a),_=Math.cos(a),d=Math.tan(a),y=this.ep2*Math.pow(_,2),g=Math.pow(y,2),x=Math.pow(d,2),v=Math.pow(x,2);i=1-this.es*Math.pow(p,2);var P=this.a/Math.sqrt(i),b=P*(1-this.es)/i,C=f/(P*this.k0),S=Math.pow(C,2);n=a-P*d*S/b*(.5-S/24*(5+3*x+10*y-4*g-9*this.ep2-S/30*(61+90*x+298*y+45*v-252*this.ep2-3*g))),r=t.adjust_lon(this.long0+C*(1-S/6*(1+2*x+y-S/20*(5-2*y+28*x-3*g+8*this.ep2+24*v)))/_)}else n=t.HALF_PI*t.sign(m),r=this.long0}return s.x=r,s.y=n,s}}}),i("proj4/projCode/utm",["../common","./tmerc"],function(t,s){return{dependsOn:"tmerc",init:function(){this.zone&&(this.lat0=0,this.long0=(6*Math.abs(this.zone)-183)*t.D2R,this.x0=5e5,this.y0=this.utmSouth?1e7:0,this.k0=.9996,s.init.apply(this),this.forward=s.forward,this.inverse=s.inverse)}}}),i("proj4/projCode/gauss",["../common"],function(t){return{init:function(){var s=Math.sin(this.lat0),i=Math.cos(this.lat0);
i*=i,this.rc=Math.sqrt(1-this.es)/(1-this.es*s*s),this.C=Math.sqrt(1+this.es*i*i/(1-this.es)),this.phic0=Math.asin(s/this.C),this.ratexp=.5*this.C*this.e,this.K=Math.tan(.5*this.phic0+t.FORTPI)/(Math.pow(Math.tan(.5*this.lat0+t.FORTPI),this.C)*t.srat(this.e*s,this.ratexp))},forward:function(s){var i=s.x,a=s.y;return s.y=2*Math.atan(this.K*Math.pow(Math.tan(.5*a+t.FORTPI),this.C)*t.srat(this.e*Math.sin(a),this.ratexp))-t.HALF_PI,s.x=this.C*i,s},inverse:function(s){for(var i=1e-14,a=s.x/this.C,h=s.y,e=Math.pow(Math.tan(.5*h+t.FORTPI)/this.K,1/this.C),n=t.MAX_ITER;n>0&&(h=2*Math.atan(e*t.srat(this.e*Math.sin(s.y),-.5*this.e))-t.HALF_PI,!(Math.abs(h-s.y)<i));--n)s.y=h;return n?(s.x=a,s.y=h,s):null}}}),i("proj4/projCode/sterea",["../common","./gauss"],function(t,s){return{init:function(){s.init.apply(this),this.rc&&(this.sinc0=Math.sin(this.phic0),this.cosc0=Math.cos(this.phic0),this.R2=2*this.rc,this.title||(this.title="Oblique Stereographic Alternative"))},forward:function(i){var a,h,e,n;return i.x=t.adjust_lon(i.x-this.long0),s.forward.apply(this,[i]),a=Math.sin(i.y),h=Math.cos(i.y),e=Math.cos(i.x),n=this.k0*this.R2/(1+this.sinc0*a+this.cosc0*h*e),i.x=n*h*Math.sin(i.x),i.y=n*(this.cosc0*a-this.sinc0*h*e),i.x=this.a*i.x+this.x0,i.y=this.a*i.y+this.y0,i},inverse:function(i){var a,h,e,n,r;if(i.x=(i.x-this.x0)/this.a,i.y=(i.y-this.y0)/this.a,i.x/=this.k0,i.y/=this.k0,r=Math.sqrt(i.x*i.x+i.y*i.y)){var o=2*Math.atan2(r,this.R2);a=Math.sin(o),h=Math.cos(o),n=Math.asin(h*this.sinc0+i.y*a*this.cosc0/r),e=Math.atan2(i.x*a,r*this.cosc0*h-i.y*this.sinc0*a)}else n=this.phic0,e=0;return i.x=e,i.y=n,s.inverse.apply(this,[i]),i.x=t.adjust_lon(i.x+this.long0),i}}}),i("proj4/projCode/somerc",[],function(){return{init:function(){var t=this.lat0;this.lambda0=this.long0;var s=Math.sin(t),i=this.a,a=this.rf,h=1/a,e=2*h-Math.pow(h,2),n=this.e=Math.sqrt(e);this.R=this.k0*i*Math.sqrt(1-e)/(1-e*Math.pow(s,2)),this.alpha=Math.sqrt(1+e/(1-e)*Math.pow(Math.cos(t),4)),this.b0=Math.asin(s/this.alpha);var r=Math.log(Math.tan(Math.PI/4+this.b0/2)),o=Math.log(Math.tan(Math.PI/4+t/2)),l=Math.log((1+n*s)/(1-n*s));this.K=r-this.alpha*o+this.alpha*n/2*l},forward:function(t){var s=Math.log(Math.tan(Math.PI/4-t.y/2)),i=this.e/2*Math.log((1+this.e*Math.sin(t.y))/(1-this.e*Math.sin(t.y))),a=-this.alpha*(s+i)+this.K,h=2*(Math.atan(Math.exp(a))-Math.PI/4),e=this.alpha*(t.x-this.lambda0),n=Math.atan(Math.sin(e)/(Math.sin(this.b0)*Math.tan(h)+Math.cos(this.b0)*Math.cos(e))),r=Math.asin(Math.cos(this.b0)*Math.sin(h)-Math.sin(this.b0)*Math.cos(h)*Math.cos(e));return t.y=this.R/2*Math.log((1+Math.sin(r))/(1-Math.sin(r)))+this.y0,t.x=this.R*n+this.x0,t},inverse:function(t){for(var s=t.x-this.x0,i=t.y-this.y0,a=s/this.R,h=2*(Math.atan(Math.exp(i/this.R))-Math.PI/4),e=Math.asin(Math.cos(this.b0)*Math.sin(h)+Math.sin(this.b0)*Math.cos(h)*Math.cos(a)),n=Math.atan(Math.sin(a)/(Math.cos(this.b0)*Math.cos(a)-Math.sin(this.b0)*Math.tan(h))),r=this.lambda0+n/this.alpha,o=0,l=e,u=-1e3,c=0;Math.abs(l-u)>1e-7;){if(++c>20)return;o=1/this.alpha*(Math.log(Math.tan(Math.PI/4+e/2))-this.K)+this.e*Math.log(Math.tan(Math.PI/4+Math.asin(this.e*Math.sin(l))/2)),u=l,l=2*Math.atan(Math.exp(o))-Math.PI/2}return t.x=r,t.y=l,t}}}),i("proj4/projCode/omerc",["../common"],function(t){return{init:function(){this.no_off=this.no_off||!1,this.no_rot=this.no_rot||!1,isNaN(this.k0)&&(this.k0=1);var s=Math.sin(this.lat0),i=Math.cos(this.lat0),a=this.e*s;this.bl=Math.sqrt(1+this.es/(1-this.es)*Math.pow(i,4)),this.al=this.a*this.bl*this.k0*Math.sqrt(1-this.es)/(1-a*a);var h=t.tsfnz(this.e,this.lat0,s),e=this.bl/i*Math.sqrt((1-this.es)/(1-a*a));1>e*e&&(e=1);var n,r;if(isNaN(this.longc)){var o=t.tsfnz(this.e,this.lat1,Math.sin(this.lat1)),l=t.tsfnz(this.e,this.lat2,Math.sin(this.lat2));this.el=this.lat0>=0?(e+Math.sqrt(e*e-1))*Math.pow(h,this.bl):(e-Math.sqrt(e*e-1))*Math.pow(h,this.bl);var u=Math.pow(o,this.bl),c=Math.pow(l,this.bl);n=this.el/u,r=.5*(n-1/n);var M=(this.el*this.el-c*u)/(this.el*this.el+c*u),f=(c-u)/(c+u),m=t.adjust_lon(this.long1-this.long2);this.long0=.5*(this.long1+this.long2)-Math.atan(M*Math.tan(.5*this.bl*m)/f)/this.bl,this.long0=t.adjust_lon(this.long0);var p=t.adjust_lon(this.long1-this.long0);this.gamma0=Math.atan(Math.sin(this.bl*p)/r),this.alpha=Math.asin(e*Math.sin(this.gamma0))}else n=this.lat0>=0?e+Math.sqrt(e*e-1):e-Math.sqrt(e*e-1),this.el=n*Math.pow(h,this.bl),r=.5*(n-1/n),this.gamma0=Math.asin(Math.sin(this.alpha)/e),this.long0=this.longc-Math.asin(r*Math.tan(this.gamma0))/this.bl;this.uc=this.no_off?0:this.lat0>=0?this.al/this.bl*Math.atan2(Math.sqrt(e*e-1),Math.cos(this.alpha)):-1*this.al/this.bl*Math.atan2(Math.sqrt(e*e-1),Math.cos(this.alpha))},forward:function(s){var i,a,h,e=s.x,n=s.y,r=t.adjust_lon(e-this.long0);if(Math.abs(Math.abs(n)-t.HALF_PI)<=t.EPSLN)h=n>0?-1:1,a=this.al/this.bl*Math.log(Math.tan(t.FORTPI+.5*h*this.gamma0)),i=-1*h*t.HALF_PI*this.al/this.bl;else{var o=t.tsfnz(this.e,n,Math.sin(n)),l=this.el/Math.pow(o,this.bl),u=.5*(l-1/l),c=.5*(l+1/l),M=Math.sin(this.bl*r),f=(u*Math.sin(this.gamma0)-M*Math.cos(this.gamma0))/c;a=Math.abs(Math.abs(f)-1)<=t.EPSLN?Number.POSITIVE_INFINITY:.5*this.al*Math.log((1-f)/(1+f))/this.bl,i=Math.abs(Math.cos(this.bl*r))<=t.EPSLN?this.al*this.bl*r:this.al*Math.atan2(u*Math.cos(this.gamma0)+M*Math.sin(this.gamma0),Math.cos(this.bl*r))/this.bl}return this.no_rot?(s.x=this.x0+i,s.y=this.y0+a):(i-=this.uc,s.x=this.x0+a*Math.cos(this.alpha)+i*Math.sin(this.alpha),s.y=this.y0+i*Math.cos(this.alpha)-a*Math.sin(this.alpha)),s},inverse:function(s){var i,a;this.no_rot?(a=s.y-this.y0,i=s.x-this.x0):(a=(s.x-this.x0)*Math.cos(this.alpha)-(s.y-this.y0)*Math.sin(this.alpha),i=(s.y-this.y0)*Math.cos(this.alpha)+(s.x-this.x0)*Math.sin(this.alpha),i+=this.uc);var h=Math.exp(-1*this.bl*a/this.al),e=.5*(h-1/h),n=.5*(h+1/h),r=Math.sin(this.bl*i/this.al),o=(r*Math.cos(this.gamma0)+e*Math.sin(this.gamma0))/n,l=Math.pow(this.el/Math.sqrt((1+o)/(1-o)),1/this.bl);return Math.abs(o-1)<t.EPSLN?(s.x=this.long0,s.y=t.HALF_PI):Math.abs(o+1)<t.EPSLN?(s.x=this.long0,s.y=-1*t.HALF_PI):(s.y=t.phi2z(this.e,l),s.x=t.adjust_lon(this.long0-Math.atan2(e*Math.cos(this.gamma0)-r*Math.sin(this.gamma0),Math.cos(this.bl*i/this.al))/this.bl)),s}}}),i("proj4/projCode/lcc",["../common"],function(t){return{init:function(){if(this.lat2||(this.lat2=this.lat1),this.k0||(this.k0=1),!(Math.abs(this.lat1+this.lat2)<t.EPSLN)){var s=this.b/this.a;this.e=Math.sqrt(1-s*s);var i=Math.sin(this.lat1),a=Math.cos(this.lat1),h=t.msfnz(this.e,i,a),e=t.tsfnz(this.e,this.lat1,i),n=Math.sin(this.lat2),r=Math.cos(this.lat2),o=t.msfnz(this.e,n,r),l=t.tsfnz(this.e,this.lat2,n),u=t.tsfnz(this.e,this.lat0,Math.sin(this.lat0));this.ns=Math.abs(this.lat1-this.lat2)>t.EPSLN?Math.log(h/o)/Math.log(e/l):i,isNaN(this.ns)&&(this.ns=i),this.f0=h/(this.ns*Math.pow(e,this.ns)),this.rh=this.a*this.f0*Math.pow(u,this.ns),this.title||(this.title="Lambert Conformal Conic")}},forward:function(s){var i=s.x,a=s.y;Math.abs(2*Math.abs(a)-t.PI)<=t.EPSLN&&(a=t.sign(a)*(t.HALF_PI-2*t.EPSLN));var h,e,n=Math.abs(Math.abs(a)-t.HALF_PI);if(n>t.EPSLN)h=t.tsfnz(this.e,a,Math.sin(a)),e=this.a*this.f0*Math.pow(h,this.ns);else{if(n=a*this.ns,0>=n)return null;e=0}var r=this.ns*t.adjust_lon(i-this.long0);return s.x=this.k0*e*Math.sin(r)+this.x0,s.y=this.k0*(this.rh-e*Math.cos(r))+this.y0,s},inverse:function(s){var i,a,h,e,n,r=(s.x-this.x0)/this.k0,o=this.rh-(s.y-this.y0)/this.k0;this.ns>0?(i=Math.sqrt(r*r+o*o),a=1):(i=-Math.sqrt(r*r+o*o),a=-1);var l=0;if(0!==i&&(l=Math.atan2(a*r,a*o)),0!==i||this.ns>0){if(a=1/this.ns,h=Math.pow(i/(this.a*this.f0),a),e=t.phi2z(this.e,h),-9999===e)return null}else e=-t.HALF_PI;return n=t.adjust_lon(l/this.ns+this.long0),s.x=n,s.y=e,s}}}),i("proj4/projCode/krovak",["../common"],function(t){return{init:function(){this.a=6377397.155,this.es=.006674372230614,this.e=Math.sqrt(this.es),this.lat0||(this.lat0=.863937979737193),this.long0||(this.long0=.4334234309119251),this.k0||(this.k0=.9999),this.s45=.785398163397448,this.s90=2*this.s45,this.fi0=this.lat0,this.e2=this.es,this.e=Math.sqrt(this.e2),this.alfa=Math.sqrt(1+this.e2*Math.pow(Math.cos(this.fi0),4)/(1-this.e2)),this.uq=1.04216856380474,this.u0=Math.asin(Math.sin(this.fi0)/this.alfa),this.g=Math.pow((1+this.e*Math.sin(this.fi0))/(1-this.e*Math.sin(this.fi0)),this.alfa*this.e/2),this.k=Math.tan(this.u0/2+this.s45)/Math.pow(Math.tan(this.fi0/2+this.s45),this.alfa)*this.g,this.k1=this.k0,this.n0=this.a*Math.sqrt(1-this.e2)/(1-this.e2*Math.pow(Math.sin(this.fi0),2)),this.s0=1.37008346281555,this.n=Math.sin(this.s0),this.ro0=this.k1*this.n0/Math.tan(this.s0),this.ad=this.s90-this.uq},forward:function(s){var i,a,h,e,n,r,o,l=s.x,u=s.y,c=t.adjust_lon(l-this.long0);return i=Math.pow((1+this.e*Math.sin(u))/(1-this.e*Math.sin(u)),this.alfa*this.e/2),a=2*(Math.atan(this.k*Math.pow(Math.tan(u/2+this.s45),this.alfa)/i)-this.s45),h=-c*this.alfa,e=Math.asin(Math.cos(this.ad)*Math.sin(a)+Math.sin(this.ad)*Math.cos(a)*Math.cos(h)),n=Math.asin(Math.cos(a)*Math.sin(h)/Math.cos(e)),r=this.n*n,o=this.ro0*Math.pow(Math.tan(this.s0/2+this.s45),this.n)/Math.pow(Math.tan(e/2+this.s45),this.n),s.y=o*Math.cos(r)/1,s.x=o*Math.sin(r)/1,this.czech||(s.y*=-1,s.x*=-1),s},inverse:function(t){var s,i,a,h,e,n,r,o,l=t.x;t.x=t.y,t.y=l,this.czech||(t.y*=-1,t.x*=-1),n=Math.sqrt(t.x*t.x+t.y*t.y),e=Math.atan2(t.y,t.x),h=e/Math.sin(this.s0),a=2*(Math.atan(Math.pow(this.ro0/n,1/this.n)*Math.tan(this.s0/2+this.s45))-this.s45),s=Math.asin(Math.cos(this.ad)*Math.sin(a)-Math.sin(this.ad)*Math.cos(a)*Math.cos(h)),i=Math.asin(Math.cos(a)*Math.sin(h)/Math.cos(s)),t.x=this.long0-i/this.alfa,r=s,o=0;var u=0;do t.y=2*(Math.atan(Math.pow(this.k,-1/this.alfa)*Math.pow(Math.tan(s/2+this.s45),1/this.alfa)*Math.pow((1+this.e*Math.sin(r))/(1-this.e*Math.sin(r)),this.e/2))-this.s45),Math.abs(r-t.y)<1e-10&&(o=1),r=t.y,u+=1;while(0===o&&15>u);return u>=15?null:t}}}),i("proj4/projCode/cass",["../common"],function(t){return{init:function(){this.sphere||(this.e0=t.e0fn(this.es),this.e1=t.e1fn(this.es),this.e2=t.e2fn(this.es),this.e3=t.e3fn(this.es),this.ml0=this.a*t.mlfn(this.e0,this.e1,this.e2,this.e3,this.lat0))},forward:function(s){var i,a,h=s.x,e=s.y;if(h=t.adjust_lon(h-this.long0),this.sphere)i=this.a*Math.asin(Math.cos(e)*Math.sin(h)),a=this.a*(Math.atan2(Math.tan(e),Math.cos(h))-this.lat0);else{var n=Math.sin(e),r=Math.cos(e),o=t.gN(this.a,this.e,n),l=Math.tan(e)*Math.tan(e),u=h*Math.cos(e),c=u*u,M=this.es*r*r/(1-this.es),f=this.a*t.mlfn(this.e0,this.e1,this.e2,this.e3,e);i=o*u*(1-c*l*(1/6-(8-l+8*M)*c/120)),a=f-this.ml0+o*n/r*c*(.5+(5-l+6*M)*c/24)}return s.x=i+this.x0,s.y=a+this.y0,s},inverse:function(s){s.x-=this.x0,s.y-=this.y0;var i,a,h=s.x/this.a,e=s.y/this.a;if(this.sphere){var n=e+this.lat0;i=Math.asin(Math.sin(n)*Math.cos(h)),a=Math.atan2(Math.tan(h),Math.cos(n))}else{var r=this.ml0/this.a+e,o=t.imlfn(r,this.e0,this.e1,this.e2,this.e3);if(Math.abs(Math.abs(o)-t.HALF_PI)<=t.EPSLN)return s.x=this.long0,s.y=t.HALF_PI,0>e&&(s.y*=-1),s;var l=t.gN(this.a,this.e,Math.sin(o)),u=l*l*l/this.a/this.a*(1-this.es),c=Math.pow(Math.tan(o),2),M=h*this.a/l,f=M*M;i=o-l*Math.tan(o)/u*M*M*(.5-(1+3*c)*M*M/24),a=M*(1-f*(c/3+(1+3*c)*c*f/15))/Math.cos(o)}return s.x=t.adjust_lon(a+this.long0),s.y=t.adjust_lat(i),s}}}),i("proj4/projCode/laea",["../common"],function(t){return{S_POLE:1,N_POLE:2,EQUIT:3,OBLIQ:4,init:function(){var s=Math.abs(this.lat0);if(this.mode=Math.abs(s-t.HALF_PI)<t.EPSLN?this.lat0<0?this.S_POLE:this.N_POLE:Math.abs(s)<t.EPSLN?this.EQUIT:this.OBLIQ,this.es>0){var i;switch(this.qp=t.qsfnz(this.e,1),this.mmf=.5/(1-this.es),this.apa=this.authset(this.es),this.mode){case this.N_POLE:this.dd=1;break;case this.S_POLE:this.dd=1;break;case this.EQUIT:this.rq=Math.sqrt(.5*this.qp),this.dd=1/this.rq,this.xmf=1,this.ymf=.5*this.qp;break;case this.OBLIQ:this.rq=Math.sqrt(.5*this.qp),i=Math.sin(this.lat0),this.sinb1=t.qsfnz(this.e,i)/this.qp,this.cosb1=Math.sqrt(1-this.sinb1*this.sinb1),this.dd=Math.cos(this.lat0)/(Math.sqrt(1-this.es*i*i)*this.rq*this.cosb1),this.ymf=(this.xmf=this.rq)/this.dd,this.xmf*=this.dd}}else this.mode===this.OBLIQ&&(this.sinph0=Math.sin(this.lat0),this.cosph0=Math.cos(this.lat0))},forward:function(s){var i,a,h,e,n,r,o,l,u,c,M=s.x,f=s.y;if(M=t.adjust_lon(M-this.long0),this.sphere){if(n=Math.sin(f),c=Math.cos(f),h=Math.cos(M),this.mode===this.OBLIQ||this.mode===this.EQUIT){if(a=this.mode===this.EQUIT?1+c*h:1+this.sinph0*n+this.cosph0*c*h,a<=t.EPSLN)return null;a=Math.sqrt(2/a),i=a*c*Math.sin(M),a*=this.mode===this.EQUIT?n:this.cosph0*n-this.sinph0*c*h}else if(this.mode===this.N_POLE||this.mode===this.S_POLE){if(this.mode===this.N_POLE&&(h=-h),Math.abs(f+this.phi0)<t.EPSLN)return null;a=t.FORTPI-.5*f,a=2*(this.mode===this.S_POLE?Math.cos(a):Math.sin(a)),i=a*Math.sin(M),a*=h}}else{switch(o=0,l=0,u=0,h=Math.cos(M),e=Math.sin(M),n=Math.sin(f),r=t.qsfnz(this.e,n),(this.mode===this.OBLIQ||this.mode===this.EQUIT)&&(o=r/this.qp,l=Math.sqrt(1-o*o)),this.mode){case this.OBLIQ:u=1+this.sinb1*o+this.cosb1*l*h;break;case this.EQUIT:u=1+l*h;break;case this.N_POLE:u=t.HALF_PI+f,r=this.qp-r;break;case this.S_POLE:u=f-t.HALF_PI,r=this.qp+r}if(Math.abs(u)<t.EPSLN)return null;switch(this.mode){case this.OBLIQ:case this.EQUIT:u=Math.sqrt(2/u),a=this.mode===this.OBLIQ?this.ymf*u*(this.cosb1*o-this.sinb1*l*h):(u=Math.sqrt(2/(1+l*h)))*o*this.ymf,i=this.xmf*u*l*e;break;case this.N_POLE:case this.S_POLE:r>=0?(i=(u=Math.sqrt(r))*e,a=h*(this.mode===this.S_POLE?u:-u)):i=a=0}}return s.x=this.a*i+this.x0,s.y=this.a*a+this.y0,s},inverse:function(s){s.x-=this.x0,s.y-=this.y0;var i,a,h,e,n,r,o,l=s.x/this.a,u=s.y/this.a;if(this.sphere){var c,M=0,f=0;if(c=Math.sqrt(l*l+u*u),a=.5*c,a>1)return null;switch(a=2*Math.asin(a),(this.mode===this.OBLIQ||this.mode===this.EQUIT)&&(f=Math.sin(a),M=Math.cos(a)),this.mode){case this.EQUIT:a=Math.abs(c)<=t.EPSLN?0:Math.asin(u*f/c),l*=f,u=M*c;break;case this.OBLIQ:a=Math.abs(c)<=t.EPSLN?this.phi0:Math.asin(M*this.sinph0+u*f*this.cosph0/c),l*=f*this.cosph0,u=(M-Math.sin(a)*this.sinph0)*c;break;case this.N_POLE:u=-u,a=t.HALF_PI-a;break;case this.S_POLE:a-=t.HALF_PI}i=0!==u||this.mode!==this.EQUIT&&this.mode!==this.OBLIQ?Math.atan2(l,u):0}else{if(o=0,this.mode===this.OBLIQ||this.mode===this.EQUIT){if(l/=this.dd,u*=this.dd,r=Math.sqrt(l*l+u*u),r<t.EPSLN)return s.x=0,s.y=this.phi0,s;e=2*Math.asin(.5*r/this.rq),h=Math.cos(e),l*=e=Math.sin(e),this.mode===this.OBLIQ?(o=h*this.sinb1+u*e*this.cosb1/r,n=this.qp*o,u=r*this.cosb1*h-u*this.sinb1*e):(o=u*e/r,n=this.qp*o,u=r*h)}else if(this.mode===this.N_POLE||this.mode===this.S_POLE){if(this.mode===this.N_POLE&&(u=-u),n=l*l+u*u,!n)return s.x=0,s.y=this.phi0,s;o=1-n/this.qp,this.mode===this.S_POLE&&(o=-o)}i=Math.atan2(l,u),a=this.authlat(Math.asin(o),this.apa)}return s.x=t.adjust_lon(this.long0+i),s.y=a,s},P00:.3333333333333333,P01:.17222222222222222,P02:.10257936507936508,P10:.06388888888888888,P11:.0664021164021164,P20:.016415012942191543,authset:function(t){var s,i=[];return i[0]=t*this.P00,s=t*t,i[0]+=s*this.P01,i[1]=s*this.P10,s*=t,i[0]+=s*this.P02,i[1]+=s*this.P11,i[2]=s*this.P20,i},authlat:function(t,s){var i=t+t;return t+s[0]*Math.sin(i)+s[1]*Math.sin(i+i)+s[2]*Math.sin(i+i+i)}}}),i("proj4/projCode/merc",["../common"],function(t){return{init:function(){var s=this.b/this.a;this.es=1-s*s,this.e=Math.sqrt(this.es),this.lat_ts?this.k0=this.sphere?Math.cos(this.lat_ts):t.msfnz(this.e,Math.sin(this.lat_ts),Math.cos(this.lat_ts)):this.k0||(this.k0=this.k?this.k:1)},forward:function(s){var i=s.x,a=s.y;if(a*t.R2D>90&&a*t.R2D<-90&&i*t.R2D>180&&i*t.R2D<-180)return null;var h,e;if(Math.abs(Math.abs(a)-t.HALF_PI)<=t.EPSLN)return null;if(this.sphere)h=this.x0+this.a*this.k0*t.adjust_lon(i-this.long0),e=this.y0+this.a*this.k0*Math.log(Math.tan(t.FORTPI+.5*a));else{var n=Math.sin(a),r=t.tsfnz(this.e,a,n);h=this.x0+this.a*this.k0*t.adjust_lon(i-this.long0),e=this.y0-this.a*this.k0*Math.log(r)}return s.x=h,s.y=e,s},inverse:function(s){var i,a,h=s.x-this.x0,e=s.y-this.y0;if(this.sphere)a=t.HALF_PI-2*Math.atan(Math.exp(-e/(this.a*this.k0)));else{var n=Math.exp(-e/(this.a*this.k0));if(a=t.phi2z(this.e,n),-9999===a)return null}return i=t.adjust_lon(this.long0+h/(this.a*this.k0)),s.x=i,s.y=a,s}}}),i("proj4/projCode/aea",["../common"],function(t){return{init:function(){Math.abs(this.lat1+this.lat2)<t.EPSLN||(this.temp=this.b/this.a,this.es=1-Math.pow(this.temp,2),this.e3=Math.sqrt(this.es),this.sin_po=Math.sin(this.lat1),this.cos_po=Math.cos(this.lat1),this.t1=this.sin_po,this.con=this.sin_po,this.ms1=t.msfnz(this.e3,this.sin_po,this.cos_po),this.qs1=t.qsfnz(this.e3,this.sin_po,this.cos_po),this.sin_po=Math.sin(this.lat2),this.cos_po=Math.cos(this.lat2),this.t2=this.sin_po,this.ms2=t.msfnz(this.e3,this.sin_po,this.cos_po),this.qs2=t.qsfnz(this.e3,this.sin_po,this.cos_po),this.sin_po=Math.sin(this.lat0),this.cos_po=Math.cos(this.lat0),this.t3=this.sin_po,this.qs0=t.qsfnz(this.e3,this.sin_po,this.cos_po),this.ns0=Math.abs(this.lat1-this.lat2)>t.EPSLN?(this.ms1*this.ms1-this.ms2*this.ms2)/(this.qs2-this.qs1):this.con,this.c=this.ms1*this.ms1+this.ns0*this.qs1,this.rh=this.a*Math.sqrt(this.c-this.ns0*this.qs0)/this.ns0)},forward:function(s){var i=s.x,a=s.y;this.sin_phi=Math.sin(a),this.cos_phi=Math.cos(a);var h=t.qsfnz(this.e3,this.sin_phi,this.cos_phi),e=this.a*Math.sqrt(this.c-this.ns0*h)/this.ns0,n=this.ns0*t.adjust_lon(i-this.long0),r=e*Math.sin(n)+this.x0,o=this.rh-e*Math.cos(n)+this.y0;return s.x=r,s.y=o,s},inverse:function(s){var i,a,h,e,n,r;return s.x-=this.x0,s.y=this.rh-s.y+this.y0,this.ns0>=0?(i=Math.sqrt(s.x*s.x+s.y*s.y),h=1):(i=-Math.sqrt(s.x*s.x+s.y*s.y),h=-1),e=0,0!==i&&(e=Math.atan2(h*s.x,h*s.y)),h=i*this.ns0/this.a,this.sphere?r=Math.asin((this.c-h*h)/(2*this.ns0)):(a=(this.c-h*h)/this.ns0,r=this.phi1z(this.e3,a)),n=t.adjust_lon(e/this.ns0+this.long0),s.x=n,s.y=r,s},phi1z:function(s,i){var a,h,e,n,r,o=t.asinz(.5*i);if(s<t.EPSLN)return o;for(var l=s*s,u=1;25>=u;u++)if(a=Math.sin(o),h=Math.cos(o),e=s*a,n=1-e*e,r=.5*n*n/h*(i/(1-l)-a/n+.5/s*Math.log((1-e)/(1+e))),o+=r,Math.abs(r)<=1e-7)return o;return null}}}),i("proj4/projCode/gnom",["../common"],function(t){return{init:function(){this.sin_p14=Math.sin(this.lat0),this.cos_p14=Math.cos(this.lat0),this.infinity_dist=1e3*this.a,this.rc=1},forward:function(s){var i,a,h,e,n,r,o,l,u=s.x,c=s.y;return h=t.adjust_lon(u-this.long0),i=Math.sin(c),a=Math.cos(c),e=Math.cos(h),r=this.sin_p14*i+this.cos_p14*a*e,n=1,r>0||Math.abs(r)<=t.EPSLN?(o=this.x0+this.a*n*a*Math.sin(h)/r,l=this.y0+this.a*n*(this.cos_p14*i-this.sin_p14*a*e)/r):(o=this.x0+this.infinity_dist*a*Math.sin(h),l=this.y0+this.infinity_dist*(this.cos_p14*i-this.sin_p14*a*e)),s.x=o,s.y=l,s},inverse:function(s){var i,a,h,e,n,r;return s.x=(s.x-this.x0)/this.a,s.y=(s.y-this.y0)/this.a,s.x/=this.k0,s.y/=this.k0,(i=Math.sqrt(s.x*s.x+s.y*s.y))?(e=Math.atan2(i,this.rc),a=Math.sin(e),h=Math.cos(e),r=t.asinz(h*this.sin_p14+s.y*a*this.cos_p14/i),n=Math.atan2(s.x*a,i*this.cos_p14*h-s.y*this.sin_p14*a),n=t.adjust_lon(this.long0+n)):(r=this.phic0,n=0),s.x=n,s.y=r,s}}}),i("proj4/projCode/cea",["../common"],function(t){return{init:function(){this.sphere||(this.k0=t.msfnz(this.e,Math.sin(this.lat_ts),Math.cos(this.lat_ts)))},forward:function(s){var i,a,h=s.x,e=s.y,n=t.adjust_lon(h-this.long0);if(this.sphere)i=this.x0+this.a*n*Math.cos(this.lat_ts),a=this.y0+this.a*Math.sin(e)/Math.cos(this.lat_ts);else{var r=t.qsfnz(this.e,Math.sin(e));i=this.x0+this.a*this.k0*n,a=this.y0+.5*this.a*r/this.k0}return s.x=i,s.y=a,s},inverse:function(s){s.x-=this.x0,s.y-=this.y0;var i,a;return this.sphere?(i=t.adjust_lon(this.long0+s.x/this.a/Math.cos(this.lat_ts)),a=Math.asin(s.y/this.a*Math.cos(this.lat_ts))):(a=t.iqsfnz(this.e,2*s.y*this.k0/this.a),i=t.adjust_lon(this.long0+s.x/(this.a*this.k0))),s.x=i,s.y=a,s}}}),i("proj4/projCode/eqc",["../common"],function(t){return{init:function(){this.x0=this.x0||0,this.y0=this.y0||0,this.lat0=this.lat0||0,this.long0=this.long0||0,this.lat_ts=this.lat_t||0,this.title=this.title||"Equidistant Cylindrical (Plate Carre)",this.rc=Math.cos(this.lat_ts)},forward:function(s){var i=s.x,a=s.y,h=t.adjust_lon(i-this.long0),e=t.adjust_lat(a-this.lat0);return s.x=this.x0+this.a*h*this.rc,s.y=this.y0+this.a*e,s},inverse:function(s){var i=s.x,a=s.y;return s.x=t.adjust_lon(this.long0+(i-this.x0)/(this.a*this.rc)),s.y=t.adjust_lat(this.lat0+(a-this.y0)/this.a),s}}}),i("proj4/projCode/poly",["../common"],function(t){return{init:function(){this.temp=this.b/this.a,this.es=1-Math.pow(this.temp,2),this.e=Math.sqrt(this.es),this.e0=t.e0fn(this.es),this.e1=t.e1fn(this.es),this.e2=t.e2fn(this.es),this.e3=t.e3fn(this.es),this.ml0=this.a*t.mlfn(this.e0,this.e1,this.e2,this.e3,this.lat0)},forward:function(s){var i,a,h,e=s.x,n=s.y,r=t.adjust_lon(e-this.long0);if(h=r*Math.sin(n),this.sphere)Math.abs(n)<=t.EPSLN?(i=this.a*r,a=-1*this.a*this.lat0):(i=this.a*Math.sin(h)/Math.tan(n),a=this.a*(t.adjust_lat(n-this.lat0)+(1-Math.cos(h))/Math.tan(n)));else if(Math.abs(n)<=t.EPSLN)i=this.a*r,a=-1*this.ml0;else{var o=t.gN(this.a,this.e,Math.sin(n))/Math.tan(n);i=o*Math.sin(h),a=this.a*t.mlfn(this.e0,this.e1,this.e2,this.e3,n)-this.ml0+o*(1-Math.cos(h))}return s.x=i+this.x0,s.y=a+this.y0,s},inverse:function(s){var i,a,h,e,n,r,o,l,u;if(h=s.x-this.x0,e=s.y-this.y0,this.sphere)if(Math.abs(e+this.a*this.lat0)<=t.EPSLN)i=t.adjust_lon(h/this.a+this.long0),a=0;else{r=this.lat0+e/this.a,o=h*h/this.a/this.a+r*r,l=r;var c;for(n=t.MAX_ITER;n;--n)if(c=Math.tan(l),u=-1*(r*(l*c+1)-l-.5*(l*l+o)*c)/((l-r)/c-1),l+=u,Math.abs(u)<=t.EPSLN){a=l;break}i=t.adjust_lon(this.long0+Math.asin(h*Math.tan(l)/this.a)/Math.sin(a))}else if(Math.abs(e+this.ml0)<=t.EPSLN)a=0,i=t.adjust_lon(this.long0+h/this.a);else{r=(this.ml0+e)/this.a,o=h*h/this.a/this.a+r*r,l=r;var M,f,m,p,_;for(n=t.MAX_ITER;n;--n)if(_=this.e*Math.sin(l),M=Math.sqrt(1-_*_)*Math.tan(l),f=this.a*t.mlfn(this.e0,this.e1,this.e2,this.e3,l),m=this.e0-2*this.e1*Math.cos(2*l)+4*this.e2*Math.cos(4*l)-6*this.e3*Math.cos(6*l),p=f/this.a,u=(r*(M*p+1)-p-.5*M*(p*p+o))/(this.es*Math.sin(2*l)*(p*p+o-2*r*p)/(4*M)+(r-p)*(M*m-2/Math.sin(2*l))-m),l-=u,Math.abs(u)<=t.EPSLN){a=l;break}M=Math.sqrt(1-this.es*Math.pow(Math.sin(a),2))*Math.tan(a),i=t.adjust_lon(this.long0+Math.asin(h*M/this.a)/Math.sin(a))}return s.x=i,s.y=a,s}}}),i("proj4/projCode/nzmg",["../common"],function(t){return{iterations:1,init:function(){this.A=[],this.A[1]=.6399175073,this.A[2]=-.1358797613,this.A[3]=.063294409,this.A[4]=-.02526853,this.A[5]=.0117879,this.A[6]=-.0055161,this.A[7]=.0026906,this.A[8]=-.001333,this.A[9]=67e-5,this.A[10]=-34e-5,this.B_re=[],this.B_im=[],this.B_re[1]=.7557853228,this.B_im[1]=0,this.B_re[2]=.249204646,this.B_im[2]=.003371507,this.B_re[3]=-.001541739,this.B_im[3]=.04105856,this.B_re[4]=-.10162907,this.B_im[4]=.01727609,this.B_re[5]=-.26623489,this.B_im[5]=-.36249218,this.B_re[6]=-.6870983,this.B_im[6]=-1.1651967,this.C_re=[],this.C_im=[],this.C_re[1]=1.3231270439,this.C_im[1]=0,this.C_re[2]=-.577245789,this.C_im[2]=-.007809598,this.C_re[3]=.508307513,this.C_im[3]=-.112208952,this.C_re[4]=-.15094762,this.C_im[4]=.18200602,this.C_re[5]=1.01418179,this.C_im[5]=1.64497696,this.C_re[6]=1.9660549,this.C_im[6]=2.5127645,this.D=[],this.D[1]=1.5627014243,this.D[2]=.5185406398,this.D[3]=-.03333098,this.D[4]=-.1052906,this.D[5]=-.0368594,this.D[6]=.007317,this.D[7]=.0122,this.D[8]=.00394,this.D[9]=-.0013},forward:function(s){var i,a=s.x,h=s.y,e=h-this.lat0,n=a-this.long0,r=1e-5*(e/t.SEC_TO_RAD),o=n,l=1,u=0;for(i=1;10>=i;i++)l*=r,u+=this.A[i]*l;var c,M,f=u,m=o,p=1,_=0,d=0,y=0;for(i=1;6>=i;i++)c=p*f-_*m,M=_*f+p*m,p=c,_=M,d=d+this.B_re[i]*p-this.B_im[i]*_,y=y+this.B_im[i]*p+this.B_re[i]*_;return s.x=y*this.a+this.x0,s.y=d*this.a+this.y0,s},inverse:function(s){var i,a,h,e=s.x,n=s.y,r=e-this.x0,o=n-this.y0,l=o/this.a,u=r/this.a,c=1,M=0,f=0,m=0;for(i=1;6>=i;i++)a=c*l-M*u,h=M*l+c*u,c=a,M=h,f=f+this.C_re[i]*c-this.C_im[i]*M,m=m+this.C_im[i]*c+this.C_re[i]*M;for(var p=0;p<this.iterations;p++){var _,d,y=f,g=m,x=l,v=u;for(i=2;6>=i;i++)_=y*f-g*m,d=g*f+y*m,y=_,g=d,x+=(i-1)*(this.B_re[i]*y-this.B_im[i]*g),v+=(i-1)*(this.B_im[i]*y+this.B_re[i]*g);y=1,g=0;var P=this.B_re[1],b=this.B_im[1];for(i=2;6>=i;i++)_=y*f-g*m,d=g*f+y*m,y=_,g=d,P+=i*(this.B_re[i]*y-this.B_im[i]*g),b+=i*(this.B_im[i]*y+this.B_re[i]*g);var C=P*P+b*b;f=(x*P+v*b)/C,m=(v*P-x*b)/C}var S=f,j=m,N=1,A=0;for(i=1;9>=i;i++)N*=S,A+=this.D[i]*N;var I=this.lat0+1e5*A*t.SEC_TO_RAD,E=this.long0+j;return s.x=E,s.y=I,s}}}),i("proj4/projCode/mill",["../common"],function(t){return{init:function(){},forward:function(s){var i=s.x,a=s.y,h=t.adjust_lon(i-this.long0),e=this.x0+this.a*h,n=this.y0+1.25*this.a*Math.log(Math.tan(t.PI/4+a/2.5));return s.x=e,s.y=n,s},inverse:function(s){s.x-=this.x0,s.y-=this.y0;var i=t.adjust_lon(this.long0+s.x/this.a),a=2.5*(Math.atan(Math.exp(.8*s.y/this.a))-t.PI/4);return s.x=i,s.y=a,s}}}),i("proj4/projCode/sinu",["../common"],function(t){return{init:function(){this.sphere?(this.n=1,this.m=0,this.es=0,this.C_y=Math.sqrt((this.m+1)/this.n),this.C_x=this.C_y/(this.m+1)):this.en=t.pj_enfn(this.es)},forward:function(s){var i,a,h=s.x,e=s.y;if(h=t.adjust_lon(h-this.long0),this.sphere){if(this.m)for(var n=this.n*Math.sin(e),r=t.MAX_ITER;r;--r){var o=(this.m*e+Math.sin(e)-n)/(this.m+Math.cos(e));if(e-=o,Math.abs(o)<t.EPSLN)break}else e=1!==this.n?Math.asin(this.n*Math.sin(e)):e;i=this.a*this.C_x*h*(this.m+Math.cos(e)),a=this.a*this.C_y*e}else{var l=Math.sin(e),u=Math.cos(e);a=this.a*t.pj_mlfn(e,l,u,this.en),i=this.a*h*u/Math.sqrt(1-this.es*l*l)}return s.x=i,s.y=a,s},inverse:function(s){var i,a,h;if(s.x-=this.x0,s.y-=this.y0,i=s.y/this.a,this.sphere)s.y/=this.C_y,i=this.m?Math.asin((this.m*s.y+Math.sin(s.y))/this.n):1!==this.n?Math.asin(Math.sin(s.y)/this.n):s.y,h=s.x/(this.C_x*(this.m+Math.cos(s.y)));else{i=t.pj_inv_mlfn(s.y/this.a,this.es,this.en);var e=Math.abs(i);e<t.HALF_PI?(e=Math.sin(i),a=this.long0+s.x*Math.sqrt(1-this.es*e*e)/(this.a*Math.cos(i)),h=t.adjust_lon(a)):e-t.EPSLN<t.HALF_PI&&(h=this.long0)}return s.x=h,s.y=i,s}}}),i("proj4/projCode/moll",["../common"],function(t){return{init:function(){},forward:function(s){for(var i=s.x,a=s.y,h=t.adjust_lon(i-this.long0),e=a,n=t.PI*Math.sin(a),r=0;!0;r++){var o=-(e+Math.sin(e)-n)/(1+Math.cos(e));if(e+=o,Math.abs(o)<t.EPSLN)break}e/=2,t.PI/2-Math.abs(a)<t.EPSLN&&(h=0);var l=.900316316158*this.a*h*Math.cos(e)+this.x0,u=1.4142135623731*this.a*Math.sin(e)+this.y0;return s.x=l,s.y=u,s},inverse:function(s){var i,a;s.x-=this.x0,s.y-=this.y0,a=s.y/(1.4142135623731*this.a),Math.abs(a)>.999999999999&&(a=.999999999999),i=Math.asin(a);var h=t.adjust_lon(this.long0+s.x/(.900316316158*this.a*Math.cos(i)));h<-t.PI&&(h=-t.PI),h>t.PI&&(h=t.PI),a=(2*i+Math.sin(2*i))/t.PI,Math.abs(a)>1&&(a=1);var e=Math.asin(a);return s.x=h,s.y=e,s}}}),i("proj4/projCode/eqdc",["../common"],function(t){return{init:function(){return Math.abs(this.lat1+this.lat2)<t.EPSLN?(t.reportError("eqdc:init: Equal Latitudes"),void 0):(this.lat2=this.lat2||this.lat1,this.temp=this.b/this.a,this.es=1-Math.pow(this.temp,2),this.e=Math.sqrt(this.es),this.e0=t.e0fn(this.es),this.e1=t.e1fn(this.es),this.e2=t.e2fn(this.es),this.e3=t.e3fn(this.es),this.sinphi=Math.sin(this.lat1),this.cosphi=Math.cos(this.lat1),this.ms1=t.msfnz(this.e,this.sinphi,this.cosphi),this.ml1=t.mlfn(this.e0,this.e1,this.e2,this.e3,this.lat1),Math.abs(this.lat1-this.lat2)<t.EPSLN?this.ns=this.sinphi:(this.sinphi=Math.sin(this.lat2),this.cosphi=Math.cos(this.lat2),this.ms2=t.msfnz(this.e,this.sinphi,this.cosphi),this.ml2=t.mlfn(this.e0,this.e1,this.e2,this.e3,this.lat2),this.ns=(this.ms1-this.ms2)/(this.ml2-this.ml1)),this.g=this.ml1+this.ms1/this.ns,this.ml0=t.mlfn(this.e0,this.e1,this.e2,this.e3,this.lat0),this.rh=this.a*(this.g-this.ml0),void 0)},forward:function(s){var i,a=s.x,h=s.y;if(this.sphere)i=this.a*(this.g-h);else{var e=t.mlfn(this.e0,this.e1,this.e2,this.e3,h);i=this.a*(this.g-e)}var n=this.ns*t.adjust_lon(a-this.long0),r=this.x0+i*Math.sin(n),o=this.y0+this.rh-i*Math.cos(n);return s.x=r,s.y=o,s},inverse:function(s){s.x-=this.x0,s.y=this.rh-s.y+this.y0;var i,a,h,e;this.ns>=0?(a=Math.sqrt(s.x*s.x+s.y*s.y),i=1):(a=-Math.sqrt(s.x*s.x+s.y*s.y),i=-1);var n=0;if(0!==a&&(n=Math.atan2(i*s.x,i*s.y)),this.sphere)return e=t.adjust_lon(this.long0+n/this.ns),h=t.adjust_lat(this.g-a/this.a),s.x=e,s.y=h,s;var r=this.g-a/this.a;return h=t.imlfn(r,this.e0,this.e1,this.e2,this.e3),e=t.adjust_lon(this.long0+n/this.ns),s.x=e,s.y=h,s}}}),i("proj4/projCode/vandg",["../common"],function(t){return{init:function(){this.R=this.a},forward:function(s){var i,a,h=s.x,e=s.y,n=t.adjust_lon(h-this.long0);Math.abs(e)<=t.EPSLN&&(i=this.x0+this.R*n,a=this.y0);var r=t.asinz(2*Math.abs(e/t.PI));(Math.abs(n)<=t.EPSLN||Math.abs(Math.abs(e)-t.HALF_PI)<=t.EPSLN)&&(i=this.x0,a=e>=0?this.y0+t.PI*this.R*Math.tan(.5*r):this.y0+t.PI*this.R*-Math.tan(.5*r));var o=.5*Math.abs(t.PI/n-n/t.PI),l=o*o,u=Math.sin(r),c=Math.cos(r),M=c/(u+c-1),f=M*M,m=M*(2/u-1),p=m*m,_=t.PI*this.R*(o*(M-p)+Math.sqrt(l*(M-p)*(M-p)-(p+l)*(f-p)))/(p+l);0>n&&(_=-_),i=this.x0+_;var d=l+M;return _=t.PI*this.R*(m*d-o*Math.sqrt((p+l)*(l+1)-d*d))/(p+l),a=e>=0?this.y0+_:this.y0-_,s.x=i,s.y=a,s},inverse:function(s){var i,a,h,e,n,r,o,l,u,c,M,f,m;return s.x-=this.x0,s.y-=this.y0,M=t.PI*this.R,h=s.x/M,e=s.y/M,n=h*h+e*e,r=-Math.abs(e)*(1+n),o=r-2*e*e+h*h,l=-2*r+1+2*e*e+n*n,m=e*e/l+(2*o*o*o/l/l/l-9*r*o/l/l)/27,u=(r-o*o/3/l)/l,c=2*Math.sqrt(-u/3),M=3*m/u/c,Math.abs(M)>1&&(M=M>=0?1:-1),f=Math.acos(M)/3,a=s.y>=0?(-c*Math.cos(f+t.PI/3)-o/3/l)*t.PI:-(-c*Math.cos(f+t.PI/3)-o/3/l)*t.PI,i=Math.abs(h)<t.EPSLN?this.long0:t.adjust_lon(this.long0+t.PI*(n-1+Math.sqrt(1+2*(h*h-e*e)+n*n))/2/h),s.x=i,s.y=a,s}}}),i("proj4/projCode/aeqd",["../common"],function(t){return{init:function(){this.sin_p12=Math.sin(this.lat0),this.cos_p12=Math.cos(this.lat0)},forward:function(s){var i,a,h,e,n,r,o,l,u,c,M,f,m,p,_,d,y,g,x,v,P,b,C,S=s.x,j=s.y,N=Math.sin(s.y),A=Math.cos(s.y),I=t.adjust_lon(S-this.long0);return this.sphere?Math.abs(this.sin_p12-1)<=t.EPSLN?(s.x=this.x0+this.a*(t.HALF_PI-j)*Math.sin(I),s.y=this.y0-this.a*(t.HALF_PI-j)*Math.cos(I),s):Math.abs(this.sin_p12+1)<=t.EPSLN?(s.x=this.x0+this.a*(t.HALF_PI+j)*Math.sin(I),s.y=this.y0+this.a*(t.HALF_PI+j)*Math.cos(I),s):(g=this.sin_p12*N+this.cos_p12*A*Math.cos(I),d=Math.acos(g),y=d/Math.sin(d),s.x=this.x0+this.a*y*A*Math.sin(I),s.y=this.y0+this.a*y*(this.cos_p12*N-this.sin_p12*A*Math.cos(I)),s):(i=t.e0fn(this.es),a=t.e1fn(this.es),h=t.e2fn(this.es),e=t.e3fn(this.es),Math.abs(this.sin_p12-1)<=t.EPSLN?(n=this.a*t.mlfn(i,a,h,e,t.HALF_PI),r=this.a*t.mlfn(i,a,h,e,j),s.x=this.x0+(n-r)*Math.sin(I),s.y=this.y0-(n-r)*Math.cos(I),s):Math.abs(this.sin_p12+1)<=t.EPSLN?(n=this.a*t.mlfn(i,a,h,e,t.HALF_PI),r=this.a*t.mlfn(i,a,h,e,j),s.x=this.x0+(n+r)*Math.sin(I),s.y=this.y0+(n+r)*Math.cos(I),s):(o=N/A,l=t.gN(this.a,this.e,this.sin_p12),u=t.gN(this.a,this.e,N),c=Math.atan((1-this.es)*o+this.es*l*this.sin_p12/(u*A)),M=Math.atan2(Math.sin(I),this.cos_p12*Math.tan(c)-this.sin_p12*Math.cos(I)),x=0===M?Math.asin(this.cos_p12*Math.sin(c)-this.sin_p12*Math.cos(c)):Math.abs(Math.abs(M)-t.PI)<=t.EPSLN?-Math.asin(this.cos_p12*Math.sin(c)-this.sin_p12*Math.cos(c)):Math.asin(Math.sin(I)*Math.cos(c)/Math.sin(M)),f=this.e*this.sin_p12/Math.sqrt(1-this.es),m=this.e*this.cos_p12*Math.cos(M)/Math.sqrt(1-this.es),p=f*m,_=m*m,v=x*x,P=v*x,b=P*x,C=b*x,d=l*x*(1-v*_*(1-_)/6+P/8*p*(1-2*_)+b/120*(_*(4-7*_)-3*f*f*(1-7*_))-C/48*p),s.x=this.x0+d*Math.sin(M),s.y=this.y0+d*Math.cos(M),s))},inverse:function(s){s.x-=this.x0,s.y-=this.y0;var i,a,h,e,n,r,o,l,u,c,M,f,m,p,_,d,y,g,x,v,P,b,C;if(this.sphere){if(i=Math.sqrt(s.x*s.x+s.y*s.y),i>2*t.HALF_PI*this.a)return;return a=i/this.a,h=Math.sin(a),e=Math.cos(a),n=this.long0,Math.abs(i)<=t.EPSLN?r=this.lat0:(r=t.asinz(e*this.sin_p12+s.y*h*this.cos_p12/i),o=Math.abs(this.lat0)-t.HALF_PI,n=Math.abs(o)<=t.EPSLN?this.lat0>=0?t.adjust_lon(this.long0+Math.atan2(s.x,-s.y)):t.adjust_lon(this.long0-Math.atan2(-s.x,s.y)):t.adjust_lon(this.long0+Math.atan2(s.x*h,i*this.cos_p12*e-s.y*this.sin_p12*h))),s.x=n,s.y=r,s}return l=t.e0fn(this.es),u=t.e1fn(this.es),c=t.e2fn(this.es),M=t.e3fn(this.es),Math.abs(this.sin_p12-1)<=t.EPSLN?(f=this.a*t.mlfn(l,u,c,M,t.HALF_PI),i=Math.sqrt(s.x*s.x+s.y*s.y),m=f-i,r=t.imlfn(m/this.a,l,u,c,M),n=t.adjust_lon(this.long0+Math.atan2(s.x,-1*s.y)),s.x=n,s.y=r,s):Math.abs(this.sin_p12+1)<=t.EPSLN?(f=this.a*t.mlfn(l,u,c,M,t.HALF_PI),i=Math.sqrt(s.x*s.x+s.y*s.y),m=i-f,r=t.imlfn(m/this.a,l,u,c,M),n=t.adjust_lon(this.long0+Math.atan2(s.x,s.y)),s.x=n,s.y=r,s):(i=Math.sqrt(s.x*s.x+s.y*s.y),d=Math.atan2(s.x,s.y),p=t.gN(this.a,this.e,this.sin_p12),y=Math.cos(d),g=this.e*this.cos_p12*y,x=-g*g/(1-this.es),v=3*this.es*(1-x)*this.sin_p12*this.cos_p12*y/(1-this.es),P=i/p,b=P-x*(1+x)*Math.pow(P,3)/6-v*(1+3*x)*Math.pow(P,4)/24,C=1-x*b*b/2-P*b*b*b/6,_=Math.asin(this.sin_p12*Math.cos(b)+this.cos_p12*Math.sin(b)*y),n=t.adjust_lon(this.long0+Math.asin(Math.sin(d)*Math.sin(b)/Math.cos(_))),r=Math.atan((1-this.es*C*this.sin_p12/Math.sin(_))*Math.tan(_)/(1-this.es)),s.x=n,s.y=r,s)
}}}),i("proj4/projections",["require","exports","module","./projCode/longlat","./projCode/tmerc","./projCode/utm","./projCode/sterea","./projCode/somerc","./projCode/omerc","./projCode/lcc","./projCode/krovak","./projCode/cass","./projCode/laea","./projCode/merc","./projCode/aea","./projCode/gnom","./projCode/cea","./projCode/eqc","./projCode/poly","./projCode/nzmg","./projCode/mill","./projCode/sinu","./projCode/moll","./projCode/eqdc","./projCode/vandg","./projCode/aeqd","./projCode/longlat"],function(t,s){s.longlat=t("./projCode/longlat"),s.identity=s.longlat,s.tmerc=t("./projCode/tmerc"),s.utm=t("./projCode/utm"),s.sterea=t("./projCode/sterea"),s.somerc=t("./projCode/somerc"),s.omerc=t("./projCode/omerc"),s.lcc=t("./projCode/lcc"),s.krovak=t("./projCode/krovak"),s.cass=t("./projCode/cass"),s.laea=t("./projCode/laea"),s.merc=t("./projCode/merc"),s.aea=t("./projCode/aea"),s.gnom=t("./projCode/gnom"),s.cea=t("./projCode/cea"),s.eqc=t("./projCode/eqc"),s.poly=t("./projCode/poly"),s.nzmg=t("./projCode/nzmg"),s.mill=t("./projCode/mill"),s.sinu=t("./projCode/sinu"),s.moll=t("./projCode/moll"),s.eqdc=t("./projCode/eqdc"),s.vandg=t("./projCode/vandg"),s.aeqd=t("./projCode/aeqd"),s.longlat=t("./projCode/longlat"),s.identity=s.longlat}),i("proj4/Proj",["./extend","./common","./defs","./constants","./datum","./projections","./wkt","./projString"],function(t,s,i,a,h,e,n,r){var o=function l(s){if(!(this instanceof l))return new l(s);this.srsCodeInput=s;var a;"string"==typeof s?s in i?(this.deriveConstants(i[s]),t(this,i[s])):s.indexOf("GEOGCS")>=0||s.indexOf("GEOCCS")>=0||s.indexOf("PROJCS")>=0||s.indexOf("LOCAL_CS")>=0?(a=n(s),this.deriveConstants(a),t(this,a)):"+"===s[0]&&(a=r(s),this.deriveConstants(a),t(this,a)):(this.deriveConstants(s),t(this,s)),this.initTransforms(this.projName)};return o.prototype={initTransforms:function(s){if(!(s in o.projections))throw"unknown projection "+s;t(this,o.projections[s]),this.init()},deriveConstants:function(i){if(i.nadgrids&&0===i.nadgrids.length&&(i.nadgrids=null),i.nadgrids){i.grids=i.nadgrids.split(",");var e=null,n=i.grids.length;if(n>0)for(var r=0;n>r;r++){e=i.grids[r];var o=e.split("@");""!==o[o.length-1]&&(i.grids[r]={mandatory:1===o.length,name:o[o.length-1],grid:a.grids[o[o.length-1]]},i.grids[r].mandatory&&!i.grids[r].grid)}}if(i.datumCode&&"none"!==i.datumCode){var l=a.Datum[i.datumCode];l&&(i.datum_params=l.towgs84?l.towgs84.split(","):null,i.ellps=l.ellipse,i.datumName=l.datumName?l.datumName:i.datumCode)}if(!i.a){var u=a.Ellipsoid[i.ellps]?a.Ellipsoid[i.ellps]:a.Ellipsoid.WGS84;t(i,u)}i.rf&&!i.b&&(i.b=(1-1/i.rf)*i.a),(0===i.rf||Math.abs(i.a-i.b)<s.EPSLN)&&(i.sphere=!0,i.b=i.a),i.a2=i.a*i.a,i.b2=i.b*i.b,i.es=(i.a2-i.b2)/i.a2,i.e=Math.sqrt(i.es),i.R_A&&(i.a*=1-i.es*(s.SIXTH+i.es*(s.RA4+i.es*s.RA6)),i.a2=i.a*i.a,i.b2=i.b*i.b,i.es=0),i.ep2=(i.a2-i.b2)/i.b2,i.k0||(i.k0=1),i.axis||(i.axis="enu"),i.datum=h(i)}},o.projections=e,o}),i("proj4/datum_transform",["./common"],function(t){return function(s,i,a){function h(s){return s===t.PJD_3PARAM||s===t.PJD_7PARAM}var e,n,r;if(s.compare_datums(i))return a;if(s.datum_type===t.PJD_NODATUM||i.datum_type===t.PJD_NODATUM)return a;var o=s.a,l=s.es,u=i.a,c=i.es,M=s.datum_type;if(M===t.PJD_GRIDSHIFT)if(0===this.apply_gridshift(s,0,a))s.a=t.SRS_WGS84_SEMIMAJOR,s.es=t.SRS_WGS84_ESQUARED;else{if(!s.datum_params)return s.a=o,s.es=s.es,a;for(e=1,n=0,r=s.datum_params.length;r>n;n++)e*=s.datum_params[n];if(0===e)return s.a=o,s.es=s.es,a;M=s.datum_params.length>3?t.PJD_7PARAM:t.PJD_3PARAM}return i.datum_type===t.PJD_GRIDSHIFT&&(i.a=t.SRS_WGS84_SEMIMAJOR,i.es=t.SRS_WGS84_ESQUARED),(s.es!==i.es||s.a!==i.a||h(M)||h(i.datum_type))&&(s.geodetic_to_geocentric(a),h(s.datum_type)&&s.geocentric_to_wgs84(a),h(i.datum_type)&&i.geocentric_from_wgs84(a),i.geocentric_to_geodetic(a)),i.datum_type===t.PJD_GRIDSHIFT&&this.apply_gridshift(i,1,a),s.a=o,s.es=l,i.a=u,i.es=c,a}}),i("proj4/adjust_axis",[],function(){return function(t,s,i){var a,h,e,n=i.x,r=i.y,o=i.z||0;for(e=0;3>e;e++)if(!s||2!==e||void 0!==i.z)switch(0===e?(a=n,h="x"):1===e?(a=r,h="y"):(a=o,h="z"),t.axis[e]){case"e":i[h]=a;break;case"w":i[h]=-a;break;case"n":i[h]=a;break;case"s":i[h]=-a;break;case"u":void 0!==i[h]&&(i.z=a);break;case"d":void 0!==i[h]&&(i.z=-a);break;default:return null}return i}}),i("proj4/transform",["./common","./datum_transform","./adjust_axis","./Proj"],function(t,s,i,a){return function(h,e,n){function r(s,i){return(s.datum.datum_type===t.PJD_3PARAM||s.datum.datum_type===t.PJD_7PARAM)&&"WGS84"!==i.datumCode}var o;return h.datum&&e.datum&&(r(h,e)||r(e,h))&&(o=new a("WGS84"),this.transform(h,o,n),h=o),"enu"!==h.axis&&i(h,!1,n),"longlat"===h.projName?(n.x*=t.D2R,n.y*=t.D2R):(h.to_meter&&(n.x*=h.to_meter,n.y*=h.to_meter),h.inverse(n)),h.from_greenwich&&(n.x+=h.from_greenwich),n=s(h.datum,e.datum,n),e.from_greenwich&&(n.x-=e.from_greenwich),"longlat"===e.projName?(n.x*=t.R2D,n.y*=t.R2D):(e.forward(n),e.to_meter&&(n.x/=e.to_meter,n.y/=e.to_meter)),"enu"!==e.axis&&i(e,!0,n),n}}),i("proj4/core",["./Point","./Proj","./transform"],function(t,s,i){var a=s("WGS84");return function(h,e,n){var r=function(s,a,n){var r;return Array.isArray(n)?(r=i(s,a,t(n)),3===n.length?[r.x,r.y,r.z]:[r.x,r.y]):i(h,e,n)};return h=h instanceof s?h:s(h),"undefined"==typeof e?(e=h,h=a):"string"==typeof e?e=s(e):"x"in e||Array.isArray(e)?(n=e,e=h,h=a):e=e instanceof s?e:s(e),n?r(h,e,n):{forward:function(t){return r(h,e,t)},inverse:function(t){return r(e,h,t)}}}}),i("proj4",["proj4/core","proj4/Proj","proj4/Point","proj4/defs","proj4/transform","proj4/mgrs"],function(t,s,i,a,h,e){return t.defaultDatum="WGS84",t.Proj=s,t.WGS84=new t.Proj("WGS84"),t.Point=i,t.defs=a,t.transform=h,t.mgrs=e,t}),s("proj4")});;(function (factory) {
	var L, proj4;
	if (typeof define === 'function' && define.amd) {
		// AMD
		define(['leaflet', 'proj4'], factory);
	} else if (typeof module !== 'undefined') {
		// Node/CommonJS
		L = require('leaflet');
		proj4 = require('proj4');
		module.exports = factory(L, proj4);
	} else {
		// Browser globals
		if (typeof window.L === 'undefined' || typeof window.proj4 === 'undefined')
			throw 'Leaflet and proj4 must be loaded first';
		factory(window.L, window.proj4);
	}
}(function (L, proj4) {

	L.Proj = {};

	L.Proj._isProj4Obj = function(a) {
		return (typeof a.inverse !== 'undefined' &&
			typeof a.forward !== 'undefined');
	};

	L.Proj.ScaleDependantTransformation = function(scaleTransforms) {
		this.scaleTransforms = scaleTransforms;
	};

	L.Proj.ScaleDependantTransformation.prototype.transform = function(point, scale) {
		return this.scaleTransforms[scale].transform(point, scale);
	};

	L.Proj.ScaleDependantTransformation.prototype.untransform = function(point, scale) {
		return this.scaleTransforms[scale].untransform(point, scale);
	};

	L.Proj.Projection = L.Class.extend({
		initialize: function(a, def) {
			if (L.Proj._isProj4Obj(a)) {
				this._proj = a;
			} else {
				var code = a;
				if (def) {
					proj4.defs(code, def);
				} else if (proj4.defs[code] === undefined) {
					var urn = code.split(':');
					if (urn.length > 3) {
						code = urn[urn.length - 3] + ':' + urn[urn.length - 1];
					}
					if (proj4.defs[code] === undefined) {
						throw 'No projection definition for code ' + code;
					}
				}
				this._proj = proj4(code);
			}
		},

		project: function (latlng) {
			var point = this._proj.forward([latlng.lng, latlng.lat]);
			return new L.Point(point[0], point[1]);
		},

		unproject: function (point, unbounded) {
			var point2 = this._proj.inverse([point.x, point.y]);
			return new L.LatLng(point2[1], point2[0], unbounded);
		}
	});

	L.Proj.CRS = L.Class.extend({
		includes: L.CRS,

		options: {
			transformation: new L.Transformation(1, 0, -1, 0)
		},

		initialize: function(a, b, c) {
			var code, proj, def, options;

			if (L.Proj._isProj4Obj(a)) {
				proj = a;
				code = proj.srsCode;
				options = b || {};

				this.projection = new L.Proj.Projection(proj);
			} else {
				code = a;
				def = b;
				options = c || {};
				this.projection = new L.Proj.Projection(code, def);
			}

			L.Util.setOptions(this, options);
			this.code = code;
			this.transformation = this.options.transformation;

			if (this.options.origin) {
				this.transformation =
					new L.Transformation(1, -this.options.origin[0],
						-1, this.options.origin[1]);
			}

			if (this.options.scales) {
				this._scales = this.options.scales;
			} else if (this.options.resolutions) {
				this._scales = [];
				for (var i = this.options.resolutions.length - 1; i >= 0; i--) {
					if (this.options.resolutions[i]) {
						this._scales[i] = 1 / this.options.resolutions[i];
					}
				}
			}

			this.scale = function(zoom) {
				return this._scales[zoom];
			};
		}
	});

	L.Proj.CRS.TMS = L.Proj.CRS.extend({
		options: {
			tileSize: 256
		},

		initialize: function(a, b, c, d) {
			var code,
				def,
				proj,
				projectedBounds,
				options;

			if (L.Proj._isProj4Obj(a)) {
				proj = a;
				projectedBounds = b;
				options = c || {};
				options.origin = [projectedBounds[0], projectedBounds[3]];
				L.Proj.CRS.prototype.initialize.call(this, proj, options);
			} else {
				code = a;
				def = b;
				projectedBounds = c;
				options = d || {};
				options.origin = [projectedBounds[0], projectedBounds[3]];
				L.Proj.CRS.prototype.initialize.call(this, code, def, options);
			}

			this.projectedBounds = projectedBounds;

			this._sizes = this._calculateSizes();
		},

		_calculateSizes: function() {
			var sizes = [],
				crsBounds = this.projectedBounds,
				projectedTileSize,
				upperY,
				i;
			for (i = this._scales.length - 1; i >= 0; i--) {
				if (this._scales[i]) {
					projectedTileSize = this.options.tileSize / this._scales[i];
					upperY = crsBounds[1] + Math.ceil((crsBounds[3] - crsBounds[1]) /
											projectedTileSize) * projectedTileSize;
					sizes[i] = L.point((crsBounds[2] - crsBounds[0]) / this._scales[i],
						(upperY - crsBounds[1]) * this._scales[i]);
				}
			}

			return sizes;
		},

		getSize: function(zoom) {
			return this._sizes[zoom];
		}
	});

	L.Proj.TileLayer = {};

	// Note: deprecated and not necessary since 0.7, will be removed
	L.Proj.TileLayer.TMS = L.TileLayer.extend({
		options: {
			continuousWorld: true
		},

		initialize: function(urlTemplate, crs, options) {
			var boundsMatchesGrid = true,
				scaleTransforms,
				upperY,
				crsBounds,
				i;

			if (!(crs instanceof L.Proj.CRS.TMS)) {
				throw 'CRS is not L.Proj.CRS.TMS.';
			}

			L.TileLayer.prototype.initialize.call(this, urlTemplate, options);
			this.crs = crs;
			crsBounds = this.crs.projectedBounds;

			// Verify grid alignment
			for (i = this.options.minZoom; i < this.options.maxZoom && boundsMatchesGrid; i++) {
				var gridHeight = (crsBounds[3] - crsBounds[1]) /
					this._projectedTileSize(i);
				boundsMatchesGrid = Math.abs(gridHeight - Math.round(gridHeight)) > 1e-3;
			}

			if (!boundsMatchesGrid) {
				scaleTransforms = {};
				for (i = this.options.minZoom; i < this.options.maxZoom; i++) {
					upperY = crsBounds[1] + Math.ceil((crsBounds[3] - crsBounds[1]) /
						this._projectedTileSize(i)) * this._projectedTileSize(i);
					scaleTransforms[this.crs.scale(i)] = new L.Transformation(1, -crsBounds[0], -1, upperY);
				}

				this.crs = new L.Proj.CRS.TMS(this.crs.projection._proj, crsBounds, this.crs.options);
				this.crs.transformation = new L.Proj.ScaleDependantTransformation(scaleTransforms);
			}
		},

		getTileUrl: function(tilePoint) {
			var zoom = this._map.getZoom(),
				gridHeight = Math.ceil(
				(this.crs.projectedBounds[3] - this.crs.projectedBounds[1]) /
				this._projectedTileSize(zoom));

			return L.Util.template(this._url, L.Util.extend({
				s: this._getSubdomain(tilePoint),
				z: this._getZoomForUrl(),
				x: tilePoint.x,
				y: gridHeight - tilePoint.y - 1
			}, this.options));
		},

		_projectedTileSize: function(zoom) {
			return (this.options.tileSize / this.crs.scale(zoom));
		}
	});

	L.Proj.GeoJSON = L.GeoJSON.extend({
		initialize: function(geojson, options) {
			if (geojson.crs && geojson.crs.type === 'name') {
				var crs = new L.Proj.CRS(geojson.crs.properties.name);
				options = options || {};
				options.coordsToLatLng = function(coords) {
					var point = L.point(coords[0], coords[1]);
					return crs.projection.unproject(point);
				};
			}
			L.GeoJSON.prototype.initialize.call(this, geojson, options);
		}
	});

	L.Proj.geoJson = function(geojson, options) {
		return new L.Proj.GeoJSON(geojson, options);
	};

	if (typeof L.CRS !== 'undefined') {
		// This is left here for backwards compatibility
		L.CRS.proj4js = (function () {
			return function (code, def, transformation, options) {
				options = options || {};
				if (transformation) {
					options.transformation = transformation;
				}

				return new L.Proj.CRS(code, def, options);
			};
		}());
	}

	return L.Proj;
}));
;
(function () {
	'use strict';

	L.Proj.CRS.TMS.Daum = new L.Proj.CRS.TMS(
			'EPSG:5181',
  			'+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  			//[-30000, -60000, 494288, 464288],
  			[-30000, -60000, 494288, 988576],
  			{
  				resolutions: [2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25]
  			}
   		);

	L.Proj.CRS.TMS.Naver = new L.Proj.CRS.TMS(
			'EPSG:5179',
			'+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  			//[90112, 1192896, 1990673, 2761664],
  			[90112, 1192896, 614400, 1717184],
  			{
  				resolutions: [2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25]
  			}
   		);

	L.Proj.CRS.TMS.VWorld = new L.Proj.CRS.TMS(
			'EPSG:900913',
			'+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs',
  			//[-20037508.34, -20037508.34, 20037508.34, 20037508.34],
  			//[-20037508.34, -20037508.34, 20037508.34, 20037508.34],
  			[-20037508.34, -20037508.34, 20037508.34, 20037508.34],
  			{
  				resolutions: [156543.0339, 78271.517, 39135.7585, 19567.8793, 9783.93965, 4891.96983, 2445.98492, 1222.99246, 611.49623, 305.748115, 152.874058, 76.437029, 38.2185145, 19.1092573, 9.55462865, 4.77731433, 2.38865717, 1.19432859, 0.5971643, 0.29858215, 0.14929108]
  				//resolutions: [156543.0339, 78271.517, 39135.7585, 19567.8793, 9783.93965, 2445.98492, 2445.98492, 1222.99246, 611.49623, 305.748115, 152.874058, 76.437029, 38.2185145, 19.1092573, 9.55462865, 4.77731433, 2.38865717, 1.19432859, 0.5971643, 0.29858215, 0.14929108]
  			}
   		);


	L.Proj.TileLayer.TMS.Provider = L.Proj.TileLayer.TMS.extend({
		initialize: function (arg, crs, options) {
			var providers = L.Proj.TileLayer.TMS.Provider.providers;
			var parts = arg.split('.');
			var providerName = parts[0];
			var variantName = parts[1];

			if (!providers[providerName]) {
				throw 'No such provider (' + providerName + ')';
			}

			var provider = {
				url: providers[providerName].url,
				crs: providers[providerName].crs,
				options: providers[providerName].options
			};

			// overwrite values in provider from variant.
			if (variantName && 'variants' in providers[providerName]) {
				if (!(variantName in providers[providerName].variants)) {
					throw 'No such name in provider (' + variantName + ')';
				}
				var variant = providers[providerName].variants[variantName];
				provider = {
					url: variant.url || provider.url,
					crs: variant.crs || provider.crs,
					options: L.Util.extend({}, provider.options, variant.options)
				};
			} else if (typeof provider.url === 'function') {
				provider.url = provider.url(parts.splice(1).join('.'));
			}

			// replace attribution placeholders with their values from toplevel provider attribution,
			// recursively
			var attributionReplacer = function (attr) {
				if (attr.indexOf('{attribution.') === -1) {
					return attr;
				}
				return attr.replace(/\{attribution.(\w*)\}/,
					function (match, attributionName) {
						return attributionReplacer(providers[attributionName].options.attribution);
					}
				);
			};
			provider.options.attribution = attributionReplacer(provider.options.attribution);

			// Compute final options combining provider options with any user overrides
			var layerOpts = L.Util.extend({}, provider.options, options);
			L.Proj.TileLayer.TMS.prototype.initialize.call(this, provider.url, provider.crs, layerOpts);

		}
	});

	/**
	 * Definition of providers.
	 * see http://leafletjs.com/reference.html#tilelayer for options in the options map.
	 */

	//jshint maxlen:220
	L.Proj.TileLayer.TMS.Provider.providers = {
		DaumMap: {
			url: 'http://i{s}.maps.daum-img.net/map/image/G03/i/1.20/L{z}/{y}/{x}.png',
			crs: L.Proj.CRS.TMS.Daum, //L.Proj.TileLayer.TMS.crsDAUM, //crsDaum,
			options: {
				maxZoom: 13, 
				minZoom: 0,
				zoomReverse: true,
				zoomOffset: 1,
				subdomains: '0123',
				continuousWorld: true,
				attribution: 'Map data &copy; <a href="http://map.daum.net/">DaumMap</a>'
					
			},
			variants: {
				Street: {},
				Satellite: {
					url: 'http://s{s}.maps.daum-img.net/L{z}/{y}/{x}.jpg'
				},
				Physical: {
					url: 'http://sr{s}.maps.daum-img.net/map/image/G03/sr/1.00/L{z}/{y}/{x}.png',
					options: {
						opacity: 0.75
					}
				},
				Hybrid: {
					url: 'http://h{s}.maps.daum-img.net/map/image/G03/h/1.20/L{z}/{y}/{x}.png'
				}


			}
		},
		NaverMap: {
			url: 'http://onetile{s}.map.naver.net/get/29/0/0/{z}/{x}/{y}/bl_vc_bg/ol_vc_an',
			crs: L.Proj.CRS.TMS.Naver, 
			options: {
				maxZoom: 13, 
				minZoom: 0,
				zoomOffset: 1,
				subdomains: '1234',
				continuousWorld: true,
				attribution: 'Map data &copy; <a href="http://map.naver.com">NaverMap</a>'
			},
			variants: {
				Street: {},
				Satellite: {
					url: 'http://onetile{s}.map.naver.net/get/29/0/0/{z}/{x}/{y}/bl_st_bg/ol_st_an'
				}, 
				Cadastral: {
					url: 'http://onetile{s}.map.naver.net/get/29/0/0/{z}/{x}/{y}/bl_vc_bg/ol_lp_cn',
					options: {
						opacity: 0.75
					}
				},
				Hybrid: {
					url: 'http://onetile{s}.map.naver.net/get/29/0/0/{z}/{x}/{y}/bl_st_bg/ol_st_rd/ol_st_an'
				}

			}

		},		
		VWorld: {
			url: 'http://xdworld.vworld.kr:8080/2d/Base/201310/{z}/{x}/{y}.png',
			//crs: L.Proj.CRS.TMS.EPSG900913, //new Proj4js.Proj('EPSG:900913'),//
			crs: L.Proj.CRS.TMS.VWorld, 
			options: {
				maxZoom: 18, 
				minZoom: 6,
				tms: true, 
				subdomains: 'abc',
				continuousWorld: true,
				attribution: 'Map data &copy; <a href="http://map.vworld.kr">VWorld</a>'
			},
			variants: {
				Street: {},
				Satellite: {
					url: 'http://xdworld.vworld.kr:8080/2d/Satellite/201301/{z}/{x}/{y}.jpeg'
				},
				Hybrid: {
					url:  'http://xdworld.vworld.kr:8080/2d/Hybrid/201310/{z}/{x}/{y}.png'
				}

			}
		}
	};

	
	L.Proj.TileLayer.TMS.provider = function (provider, crs, options) {
		return new L.Proj.TileLayer.TMS.Provider(provider, crs, options);
	};

	L.Control.Layers.Provided = L.Control.Layers.extend({
		initialize: function (base, overlay, options) {
			var first;

			var labelFormatter = function (label) {
				return label.replace(/\./g, ': ').replace(/([a-z])([A-Z])/g, '$1 $2');
			};

			if (base.length) {
				(function () {
					var out = {},
					    len = base.length,
					    i = 0;

					while (i < len) {
						if (typeof base[i] === 'string') {
							if (i === 0) {
								first = L.tileLayer.provider(base[0]);
								out[labelFormatter(base[i])] = first;
							} else {
								out[labelFormatter(base[i])] = L.tileLayer.provider(base[i]);
							}
						}
						i++;
					}
					base = out;
				}());
				this._first = first;
			}

			if (overlay && overlay.length) {
				(function () {
					var out = {},
					    len = overlay.length,
					    i = 0;

					while (i < len) {
						if (typeof base[i] === 'string') {
							out[labelFormatter(overlay[i])] = L.tileLayer.provider(overlay[i]);
						}
						i++;
					}
					overlay = out;
				}());
			}
			L.Control.Layers.prototype.initialize.call(this, base, overlay, options);
		},
		onAdd: function (map) {
			this._first.addTo(map);
			return L.Control.Layers.prototype.onAdd.call(this, map);
		}
	});

	L.control.layers.provided = function (baseLayers, overlays, options) {
		return new L.Control.Layers.Provided(baseLayers, overlays, options);
	};
	
}());

;/*!
 * classie - class helper functions
 * from bonzo https://github.com/ded/bonzo
 * 
 * classie.has( elem, 'my-class' ) -> true/false
 * classie.add( elem, 'my-new-class' )
 * classie.remove( elem, 'my-unwanted-class' )
 * classie.toggle( elem, 'my-class' )
 */

/*jshint browser: true, strict: true, undef: true */
/*global define: false */

( function( window ) {

'use strict';

// class helper functions from bonzo https://github.com/ded/bonzo

function classReg( className ) {
  return new RegExp("(^|\\s+)" + className + "(\\s+|$)");
}

// classList support for class management
// altho to be fair, the api sucks because it won't accept multiple classes at once
var hasClass, addClass, removeClass;

if ( 'classList' in document.documentElement ) {
  hasClass = function( elem, c ) {
    return elem.classList.contains( c );
  };
  addClass = function( elem, c ) {
    console.log(elem);
      elem.classList.add( c ); 
    // }catch(err){}
  };
  removeClass = function( elem, c ) {
    console.log(elem);
      elem.classList.remove( c );
    // }catch(err){}
  };
}
else {
  hasClass = function( elem, c ) {
    return classReg( c ).test( elem.className );
  };
  addClass = function( elem, c ) {
    if ( !hasClass( elem, c ) ) {
      elem.className = elem.className + ' ' + c;
    }
  };
  removeClass = function( elem, c ) {
    elem.className = elem.className.replace( classReg( c ), ' ' );
  };
}

function toggleClass( elem, c ) {
  var fn = hasClass( elem, c ) ? removeClass : addClass;
  fn( elem, c );
}

var classie = {
  // full names
  hasClass: hasClass,
  addClass: addClass,
  removeClass: removeClass,
  toggleClass: toggleClass,
  // short names
  has: hasClass,
  add: addClass,
  remove: removeClass,
  toggle: toggleClass
};

// transport
if ( typeof define === 'function' && define.amd ) {
  // AMD
  define( classie );
} else {
  // browser global
  window.classie = classie;
}

})( window );
;/* jqBootstrapValidation
 * A plugin for automating validation on Twitter Bootstrap formatted forms.
 *
 * v1.3.6
 *
 * License: MIT <http://opensource.org/licenses/mit-license.php> - see LICENSE file
 *
 * http://ReactiveRaven.github.com/jqBootstrapValidation/
 */

(function( $ ){

	var createdElements = [];

	var defaults = {
		options: {
			prependExistingHelpBlock: false,
			sniffHtml: true, // sniff for 'required', 'maxlength', etc
			preventSubmit: true, // stop the form submit event from firing if validation fails
			submitError: false, // function called if there is an error when trying to submit
			submitSuccess: false, // function called just before a successful submit event is sent to the server
            semanticallyStrict: false, // set to true to tidy up generated HTML output
			autoAdd: {
				helpBlocks: true
			},
            filter: function () {
                // return $(this).is(":visible"); // only validate elements you can see
                return true; // validate everything
            }
		},
    methods: {
      init : function( options ) {

        var settings = $.extend(true, {}, defaults);

        settings.options = $.extend(true, settings.options, options);

        var $siblingElements = this;

        var uniqueForms = $.unique(
          $siblingElements.map( function () {
            return $(this).parents("form")[0];
          }).toArray()
        );

        $(uniqueForms).bind("submit", function (e) {
          var $form = $(this);
          var warningsFound = 0;
          var $inputs = $form.find("input,textarea,select").not("[type=submit],[type=image]").filter(settings.options.filter);
          $inputs.trigger("submit.validation").trigger("validationLostFocus.validation");

          $inputs.each(function (i, el) {
            var $this = $(el),
              $controlGroup = $this.parents(".form-group").first();
            if (
              $controlGroup.hasClass("warning")
            ) {
              $controlGroup.removeClass("warning").addClass("error");
              warningsFound++;
            }
          });

          $inputs.trigger("validationLostFocus.validation");

          if (warningsFound) {
            if (settings.options.preventSubmit) {
              e.preventDefault();
            }
            $form.addClass("error");
            if ($.isFunction(settings.options.submitError)) {
              settings.options.submitError($form, e, $inputs.jqBootstrapValidation("collectErrors", true));
            }
          } else {
            $form.removeClass("error");
            if ($.isFunction(settings.options.submitSuccess)) {
              settings.options.submitSuccess($form, e);
            }
          }
        });

        return this.each(function(){

          // Get references to everything we're interested in
          var $this = $(this),
            $controlGroup = $this.parents(".form-group").first(),
            $helpBlock = $controlGroup.find(".help-block").first(),
            $form = $this.parents("form").first(),
            validatorNames = [];

          // create message container if not exists
          if (!$helpBlock.length && settings.options.autoAdd && settings.options.autoAdd.helpBlocks) {
              $helpBlock = $('<div class="help-block" />');
              $controlGroup.find('.controls').append($helpBlock);
							createdElements.push($helpBlock[0]);
          }

          // =============================================================
          //                                     SNIFF HTML FOR VALIDATORS
          // =============================================================

          // *snort sniff snuffle*

          if (settings.options.sniffHtml) {
            var message = "";
            // ---------------------------------------------------------
            //                                                   PATTERN
            // ---------------------------------------------------------
            if ($this.attr("pattern") !== undefined) {
              message = "Not in the expected format<!-- data-validation-pattern-message to override -->";
              if ($this.data("validationPatternMessage")) {
                message = $this.data("validationPatternMessage");
              }
              $this.data("validationPatternMessage", message);
              $this.data("validationPatternRegex", $this.attr("pattern"));
            }
            // ---------------------------------------------------------
            //                                                       MAX
            // ---------------------------------------------------------
            if ($this.attr("max") !== undefined || $this.attr("aria-valuemax") !== undefined) {
              var max = ($this.attr("max") !== undefined ? $this.attr("max") : $this.attr("aria-valuemax"));
              message = "Too high: Maximum of '" + max + "'<!-- data-validation-max-message to override -->";
              if ($this.data("validationMaxMessage")) {
                message = $this.data("validationMaxMessage");
              }
              $this.data("validationMaxMessage", message);
              $this.data("validationMaxMax", max);
            }
            // ---------------------------------------------------------
            //                                                       MIN
            // ---------------------------------------------------------
            if ($this.attr("min") !== undefined || $this.attr("aria-valuemin") !== undefined) {
              var min = ($this.attr("min") !== undefined ? $this.attr("min") : $this.attr("aria-valuemin"));
              message = "Too low: Minimum of '" + min + "'<!-- data-validation-min-message to override -->";
              if ($this.data("validationMinMessage")) {
                message = $this.data("validationMinMessage");
              }
              $this.data("validationMinMessage", message);
              $this.data("validationMinMin", min);
            }
            // ---------------------------------------------------------
            //                                                 MAXLENGTH
            // ---------------------------------------------------------
            if ($this.attr("maxlength") !== undefined) {
              message = "Too long: Maximum of '" + $this.attr("maxlength") + "' characters<!-- data-validation-maxlength-message to override -->";
              if ($this.data("validationMaxlengthMessage")) {
                message = $this.data("validationMaxlengthMessage");
              }
              $this.data("validationMaxlengthMessage", message);
              $this.data("validationMaxlengthMaxlength", $this.attr("maxlength"));
            }
            // ---------------------------------------------------------
            //                                                 MINLENGTH
            // ---------------------------------------------------------
            if ($this.attr("minlength") !== undefined) {
              message = "Too short: Minimum of '" + $this.attr("minlength") + "' characters<!-- data-validation-minlength-message to override -->";
              if ($this.data("validationMinlengthMessage")) {
                message = $this.data("validationMinlengthMessage");
              }
              $this.data("validationMinlengthMessage", message);
              $this.data("validationMinlengthMinlength", $this.attr("minlength"));
            }
            // ---------------------------------------------------------
            //                                                  REQUIRED
            // ---------------------------------------------------------
            if ($this.attr("required") !== undefined || $this.attr("aria-required") !== undefined) {
              message = settings.builtInValidators.required.message;
              if ($this.data("validationRequiredMessage")) {
                message = $this.data("validationRequiredMessage");
              }
              $this.data("validationRequiredMessage", message);
            }
            // ---------------------------------------------------------
            //                                                    NUMBER
            // ---------------------------------------------------------
            if ($this.attr("type") !== undefined && $this.attr("type").toLowerCase() === "number") {
              message = settings.builtInValidators.number.message;
              if ($this.data("validationNumberMessage")) {
                message = $this.data("validationNumberMessage");
              }
              $this.data("validationNumberMessage", message);
            }
            // ---------------------------------------------------------
            //                                                     EMAIL
            // ---------------------------------------------------------
            if ($this.attr("type") !== undefined && $this.attr("type").toLowerCase() === "email") {
              message = "Not a valid email address<!-- data-validator-validemail-message to override -->";
              if ($this.data("validationValidemailMessage")) {
                message = $this.data("validationValidemailMessage");
              } else if ($this.data("validationEmailMessage")) {
                message = $this.data("validationEmailMessage");
              }
              $this.data("validationValidemailMessage", message);
            }
            // ---------------------------------------------------------
            //                                                MINCHECKED
            // ---------------------------------------------------------
            if ($this.attr("minchecked") !== undefined) {
              message = "Not enough options checked; Minimum of '" + $this.attr("minchecked") + "' required<!-- data-validation-minchecked-message to override -->";
              if ($this.data("validationMincheckedMessage")) {
                message = $this.data("validationMincheckedMessage");
              }
              $this.data("validationMincheckedMessage", message);
              $this.data("validationMincheckedMinchecked", $this.attr("minchecked"));
            }
            // ---------------------------------------------------------
            //                                                MAXCHECKED
            // ---------------------------------------------------------
            if ($this.attr("maxchecked") !== undefined) {
              message = "Too many options checked; Maximum of '" + $this.attr("maxchecked") + "' required<!-- data-validation-maxchecked-message to override -->";
              if ($this.data("validationMaxcheckedMessage")) {
                message = $this.data("validationMaxcheckedMessage");
              }
              $this.data("validationMaxcheckedMessage", message);
              $this.data("validationMaxcheckedMaxchecked", $this.attr("maxchecked"));
            }
          }

          // =============================================================
          //                                       COLLECT VALIDATOR NAMES
          // =============================================================

          // Get named validators
          if ($this.data("validation") !== undefined) {
            validatorNames = $this.data("validation").split(",");
          }

          // Get extra ones defined on the element's data attributes
          $.each($this.data(), function (i, el) {
            var parts = i.replace(/([A-Z])/g, ",$1").split(",");
            if (parts[0] === "validation" && parts[1]) {
              validatorNames.push(parts[1]);
            }
          });

          // =============================================================
          //                                     NORMALISE VALIDATOR NAMES
          // =============================================================

          var validatorNamesToInspect = validatorNames;
          var newValidatorNamesToInspect = [];

          do // repeatedly expand 'shortcut' validators into their real validators
          {
            // Uppercase only the first letter of each name
            $.each(validatorNames, function (i, el) {
              validatorNames[i] = formatValidatorName(el);
            });

            // Remove duplicate validator names
            validatorNames = $.unique(validatorNames);

            // Pull out the new validator names from each shortcut
            newValidatorNamesToInspect = [];
            $.each(validatorNamesToInspect, function(i, el) {
              if ($this.data("validation" + el + "Shortcut") !== undefined) {
                // Are these custom validators?
                // Pull them out!
                $.each($this.data("validation" + el + "Shortcut").split(","), function(i2, el2) {
                  newValidatorNamesToInspect.push(el2);
                });
              } else if (settings.builtInValidators[el.toLowerCase()]) {
                // Is this a recognised built-in?
                // Pull it out!
                var validator = settings.builtInValidators[el.toLowerCase()];
                if (validator.type.toLowerCase() === "shortcut") {
                  $.each(validator.shortcut.split(","), function (i, el) {
                    el = formatValidatorName(el);
                    newValidatorNamesToInspect.push(el);
                    validatorNames.push(el);
                  });
                }
              }
            });

            validatorNamesToInspect = newValidatorNamesToInspect;

          } while (validatorNamesToInspect.length > 0)

          // =============================================================
          //                                       SET UP VALIDATOR ARRAYS
          // =============================================================

          var validators = {};

          $.each(validatorNames, function (i, el) {
            // Set up the 'override' message
            var message = $this.data("validation" + el + "Message");
            var hasOverrideMessage = (message !== undefined);
            var foundValidator = false;
            message =
              (
                message
                  ? message
                  : "'" + el + "' validation failed <!-- Add attribute 'data-validation-" + el.toLowerCase() + "-message' to input to change this message -->"
              )
            ;

            $.each(
              settings.validatorTypes,
              function (validatorType, validatorTemplate) {
                if (validators[validatorType] === undefined) {
                  validators[validatorType] = [];
                }
                if (!foundValidator && $this.data("validation" + el + formatValidatorName(validatorTemplate.name)) !== undefined) {
                  validators[validatorType].push(
                    $.extend(
                      true,
                      {
                        name: formatValidatorName(validatorTemplate.name),
                        message: message
                      },
                      validatorTemplate.init($this, el)
                    )
                  );
                  foundValidator = true;
                }
              }
            );

            if (!foundValidator && settings.builtInValidators[el.toLowerCase()]) {

              var validator = $.extend(true, {}, settings.builtInValidators[el.toLowerCase()]);
              if (hasOverrideMessage) {
                validator.message = message;
              }
              var validatorType = validator.type.toLowerCase();

              if (validatorType === "shortcut") {
                foundValidator = true;
              } else {
                $.each(
                  settings.validatorTypes,
                  function (validatorTemplateType, validatorTemplate) {
                    if (validators[validatorTemplateType] === undefined) {
                      validators[validatorTemplateType] = [];
                    }
                    if (!foundValidator && validatorType === validatorTemplateType.toLowerCase()) {
                      $this.data("validation" + el + formatValidatorName(validatorTemplate.name), validator[validatorTemplate.name.toLowerCase()]);
                      validators[validatorType].push(
                        $.extend(
                          validator,
                          validatorTemplate.init($this, el)
                        )
                      );
                      foundValidator = true;
                    }
                  }
                );
              }
            }

            if (! foundValidator) {
              $.error("Cannot find validation info for '" + el + "'");
            }
          });

          // =============================================================
          //                                         STORE FALLBACK VALUES
          // =============================================================

          $helpBlock.data(
            "original-contents",
            (
              $helpBlock.data("original-contents")
                ? $helpBlock.data("original-contents")
                : $helpBlock.html()
            )
          );

          $helpBlock.data(
            "original-role",
            (
              $helpBlock.data("original-role")
                ? $helpBlock.data("original-role")
                : $helpBlock.attr("role")
            )
          );

          $controlGroup.data(
            "original-classes",
            (
              $controlGroup.data("original-clases")
                ? $controlGroup.data("original-classes")
                : $controlGroup.attr("class")
            )
          );

          $this.data(
            "original-aria-invalid",
            (
              $this.data("original-aria-invalid")
                ? $this.data("original-aria-invalid")
                : $this.attr("aria-invalid")
            )
          );

          // =============================================================
          //                                                    VALIDATION
          // =============================================================

          $this.bind(
            "validation.validation",
            function (event, params) {

              var value = getValue($this);

              // Get a list of the errors to apply
              var errorsFound = [];

              $.each(validators, function (validatorType, validatorTypeArray) {
                if (value || value.length || (params && params.includeEmpty) || (!!settings.validatorTypes[validatorType].blockSubmit && params && !!params.submitting)) {
                  $.each(validatorTypeArray, function (i, validator) {
                    if (settings.validatorTypes[validatorType].validate($this, value, validator)) {
                      errorsFound.push(validator.message);
                    }
                  });
                }
              });

              return errorsFound;
            }
          );

          $this.bind(
            "getValidators.validation",
            function () {
              return validators;
            }
          );

          // =============================================================
          //                                             WATCH FOR CHANGES
          // =============================================================
          $this.bind(
            "submit.validation",
            function () {
              return $this.triggerHandler("change.validation", {submitting: true});
            }
          );
          $this.bind(
            [
              "keyup",
              "focus",
              "blur",
              "click",
              "keydown",
              "keypress",
              "change"
            ].join(".validation ") + ".validation",
            function (e, params) {

              var value = getValue($this);

              var errorsFound = [];

              $controlGroup.find("input,textarea,select").each(function (i, el) {
                var oldCount = errorsFound.length;
                $.each($(el).triggerHandler("validation.validation", params), function (j, message) {
                  errorsFound.push(message);
                });
                if (errorsFound.length > oldCount) {
                  $(el).attr("aria-invalid", "true");
                } else {
                  var original = $this.data("original-aria-invalid");
                  $(el).attr("aria-invalid", (original !== undefined ? original : false));
                }
              });

              $form.find("input,select,textarea").not($this).not("[name=\"" + $this.attr("name") + "\"]").trigger("validationLostFocus.validation");

              errorsFound = $.unique(errorsFound.sort());

              // Were there any errors?
              if (errorsFound.length) {
                // Better flag it up as a warning.
                $controlGroup.removeClass("success error").addClass("warning");

                // How many errors did we find?
                if (settings.options.semanticallyStrict && errorsFound.length === 1) {
                  // Only one? Being strict? Just output it.
                  $helpBlock.html(errorsFound[0] + 
                    ( settings.options.prependExistingHelpBlock ? $helpBlock.data("original-contents") : "" ));
                } else {
                  // Multiple? Being sloppy? Glue them together into an UL.
                  $helpBlock.html("<ul role=\"alert\"><li>" + errorsFound.join("</li><li>") + "</li></ul>" +
                    ( settings.options.prependExistingHelpBlock ? $helpBlock.data("original-contents") : "" ));
                }
              } else {
                $controlGroup.removeClass("warning error success");
                if (value.length > 0) {
                  $controlGroup.addClass("success");
                }
                $helpBlock.html($helpBlock.data("original-contents"));
              }

              if (e.type === "blur") {
                $controlGroup.removeClass("success");
              }
            }
          );
          $this.bind("validationLostFocus.validation", function () {
            $controlGroup.removeClass("success");
          });
        });
      },
      destroy : function( ) {

        return this.each(
          function() {

            var
              $this = $(this),
              $controlGroup = $this.parents(".form-group").first(),
              $helpBlock = $controlGroup.find(".help-block").first();

            // remove our events
            $this.unbind('.validation'); // events are namespaced.
            // reset help text
            $helpBlock.html($helpBlock.data("original-contents"));
            // reset classes
            $controlGroup.attr("class", $controlGroup.data("original-classes"));
            // reset aria
            $this.attr("aria-invalid", $this.data("original-aria-invalid"));
            // reset role
            $helpBlock.attr("role", $this.data("original-role"));
						// remove all elements we created
						if (createdElements.indexOf($helpBlock[0]) > -1) {
							$helpBlock.remove();
						}

          }
        );

      },
      collectErrors : function(includeEmpty) {

        var errorMessages = {};
        this.each(function (i, el) {
          var $el = $(el);
          var name = $el.attr("name");
          var errors = $el.triggerHandler("validation.validation", {includeEmpty: true});
          errorMessages[name] = $.extend(true, errors, errorMessages[name]);
        });

        $.each(errorMessages, function (i, el) {
          if (el.length === 0) {
            delete errorMessages[i];
          }
        });

        return errorMessages;

      },
      hasErrors: function() {

        var errorMessages = [];

        this.each(function (i, el) {
          errorMessages = errorMessages.concat(
            $(el).triggerHandler("getValidators.validation") ? $(el).triggerHandler("validation.validation", {submitting: true}) : []
          );
        });

        return (errorMessages.length > 0);
      },
      override : function (newDefaults) {
        defaults = $.extend(true, defaults, newDefaults);
      }
    },
		validatorTypes: {
      callback: {
        name: "callback",
        init: function ($this, name) {
          return {
            validatorName: name,
            callback: $this.data("validation" + name + "Callback"),
            lastValue: $this.val(),
            lastValid: true,
            lastFinished: true
          };
        },
        validate: function ($this, value, validator) {
          if (validator.lastValue === value && validator.lastFinished) {
            return !validator.lastValid;
          }

          if (validator.lastFinished === true)
          {
            validator.lastValue = value;
            validator.lastValid = true;
            validator.lastFinished = false;

            var rrjqbvValidator = validator;
            var rrjqbvThis = $this;
            executeFunctionByName(
              validator.callback,
              window,
              $this,
              value,
              function (data) {
                if (rrjqbvValidator.lastValue === data.value) {
                  rrjqbvValidator.lastValid = data.valid;
                  if (data.message) {
                    rrjqbvValidator.message = data.message;
                  }
                  rrjqbvValidator.lastFinished = true;
                  rrjqbvThis.data("validation" + rrjqbvValidator.validatorName + "Message", rrjqbvValidator.message);
                  // Timeout is set to avoid problems with the events being considered 'already fired'
                  setTimeout(function () {
                    rrjqbvThis.trigger("change.validation");
                  }, 1); // doesn't need a long timeout, just long enough for the event bubble to burst
                }
              }
            );
          }

          return false;

        }
      },
      ajax: {
        name: "ajax",
        init: function ($this, name) {
          return {
            validatorName: name,
            url: $this.data("validation" + name + "Ajax"),
            lastValue: $this.val(),
            lastValid: true,
            lastFinished: true
          };
        },
        validate: function ($this, value, validator) {
          if (""+validator.lastValue === ""+value && validator.lastFinished === true) {
            return validator.lastValid === false;
          }

          if (validator.lastFinished === true)
          {
            validator.lastValue = value;
            validator.lastValid = true;
            validator.lastFinished = false;
            $.ajax({
              url: validator.url,
              data: "value=" + value + "&field=" + $this.attr("name"),
              dataType: "json",
              success: function (data) {
                if (""+validator.lastValue === ""+data.value) {
                  validator.lastValid = !!(data.valid);
                  if (data.message) {
                    validator.message = data.message;
                  }
                  validator.lastFinished = true;
                  $this.data("validation" + validator.validatorName + "Message", validator.message);
                  // Timeout is set to avoid problems with the events being considered 'already fired'
                  setTimeout(function () {
                    $this.trigger("change.validation");
                  }, 1); // doesn't need a long timeout, just long enough for the event bubble to burst
                }
              },
              failure: function () {
                validator.lastValid = true;
                validator.message = "ajax call failed";
                validator.lastFinished = true;
                $this.data("validation" + validator.validatorName + "Message", validator.message);
                // Timeout is set to avoid problems with the events being considered 'already fired'
                setTimeout(function () {
                  $this.trigger("change.validation");
                }, 1); // doesn't need a long timeout, just long enough for the event bubble to burst
              }
            });
          }

          return false;

        }
      },
			regex: {
				name: "regex",
				init: function ($this, name) {
					return {regex: regexFromString($this.data("validation" + name + "Regex"))};
				},
				validate: function ($this, value, validator) {
					return (!validator.regex.test(value) && ! validator.negative)
						|| (validator.regex.test(value) && validator.negative);
				}
			},
			required: {
				name: "required",
				init: function ($this, name) {
					return {};
				},
				validate: function ($this, value, validator) {
					return !!(value.length === 0  && ! validator.negative)
						|| !!(value.length > 0 && validator.negative);
				},
        blockSubmit: true
			},
			match: {
				name: "match",
				init: function ($this, name) {
					var element = $this.parents("form").first().find("[name=\"" + $this.data("validation" + name + "Match") + "\"]").first();
					element.bind("validation.validation", function () {
						$this.trigger("change.validation", {submitting: true});
					});
					return {"element": element};
				},
				validate: function ($this, value, validator) {
					return (value !== validator.element.val() && ! validator.negative)
						|| (value === validator.element.val() && validator.negative);
				},
        blockSubmit: true
			},
			max: {
				name: "max",
				init: function ($this, name) {
					return {max: $this.data("validation" + name + "Max")};
				},
				validate: function ($this, value, validator) {
					return (parseFloat(value, 10) > parseFloat(validator.max, 10) && ! validator.negative)
						|| (parseFloat(value, 10) <= parseFloat(validator.max, 10) && validator.negative);
				}
			},
			min: {
				name: "min",
				init: function ($this, name) {
					return {min: $this.data("validation" + name + "Min")};
				},
				validate: function ($this, value, validator) {
					return (parseFloat(value) < parseFloat(validator.min) && ! validator.negative)
						|| (parseFloat(value) >= parseFloat(validator.min) && validator.negative);
				}
			},
			maxlength: {
				name: "maxlength",
				init: function ($this, name) {
					return {maxlength: $this.data("validation" + name + "Maxlength")};
				},
				validate: function ($this, value, validator) {
					return ((value.length > validator.maxlength) && ! validator.negative)
						|| ((value.length <= validator.maxlength) && validator.negative);
				}
			},
			minlength: {
				name: "minlength",
				init: function ($this, name) {
					return {minlength: $this.data("validation" + name + "Minlength")};
				},
				validate: function ($this, value, validator) {
					return ((value.length < validator.minlength) && ! validator.negative)
						|| ((value.length >= validator.minlength) && validator.negative);
				}
			},
			maxchecked: {
				name: "maxchecked",
				init: function ($this, name) {
					var elements = $this.parents("form").first().find("[name=\"" + $this.attr("name") + "\"]");
					elements.bind("click.validation", function () {
						$this.trigger("change.validation", {includeEmpty: true});
					});
					return {maxchecked: $this.data("validation" + name + "Maxchecked"), elements: elements};
				},
				validate: function ($this, value, validator) {
					return (validator.elements.filter(":checked").length > validator.maxchecked && ! validator.negative)
						|| (validator.elements.filter(":checked").length <= validator.maxchecked && validator.negative);
				},
        blockSubmit: true
			},
			minchecked: {
				name: "minchecked",
				init: function ($this, name) {
					var elements = $this.parents("form").first().find("[name=\"" + $this.attr("name") + "\"]");
					elements.bind("click.validation", function () {
						$this.trigger("change.validation", {includeEmpty: true});
					});
					return {minchecked: $this.data("validation" + name + "Minchecked"), elements: elements};
				},
				validate: function ($this, value, validator) {
					return (validator.elements.filter(":checked").length < validator.minchecked && ! validator.negative)
						|| (validator.elements.filter(":checked").length >= validator.minchecked && validator.negative);
				},
        blockSubmit: true
			}
		},
		builtInValidators: {
			email: {
				name: "Email",
				type: "shortcut",
				shortcut: "validemail"
			},
			validemail: {
				name: "Validemail",
				type: "regex",
				regex: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\\.[A-Za-z]{2,4}",
				message: "Not a valid email address<!-- data-validator-validemail-message to override -->"
			},
			passwordagain: {
				name: "Passwordagain",
				type: "match",
				match: "password",
				message: "Does not match the given password<!-- data-validator-paswordagain-message to override -->"
			},
			positive: {
				name: "Positive",
				type: "shortcut",
				shortcut: "number,positivenumber"
			},
			negative: {
				name: "Negative",
				type: "shortcut",
				shortcut: "number,negativenumber"
			},
			number: {
				name: "Number",
				type: "regex",
				regex: "([+-]?\\\d+(\\\.\\\d*)?([eE][+-]?[0-9]+)?)?",
				message: "Must be a number<!-- data-validator-number-message to override -->"
			},
			integer: {
				name: "Integer",
				type: "regex",
				regex: "[+-]?\\\d+",
				message: "No decimal places allowed<!-- data-validator-integer-message to override -->"
			},
			positivenumber: {
				name: "Positivenumber",
				type: "min",
				min: 0,
				message: "Must be a positive number<!-- data-validator-positivenumber-message to override -->"
			},
			negativenumber: {
				name: "Negativenumber",
				type: "max",
				max: 0,
				message: "Must be a negative number<!-- data-validator-negativenumber-message to override -->"
			},
			required: {
				name: "Required",
				type: "required",
				message: "This is required<!-- data-validator-required-message to override -->"
			},
			checkone: {
				name: "Checkone",
				type: "minchecked",
				minchecked: 1,
				message: "Check at least one option<!-- data-validation-checkone-message to override -->"
			}
		}
	};

	var formatValidatorName = function (name) {
		return name
			.toLowerCase()
			.replace(
				/(^|\s)([a-z])/g ,
				function(m,p1,p2) {
					return p1+p2.toUpperCase();
				}
			)
		;
	};

	var getValue = function ($this) {
		// Extract the value we're talking about
		var value = $this.val();
		var type = $this.attr("type");
		if (type === "checkbox") {
			value = ($this.is(":checked") ? value : "");
		}
		if (type === "radio") {
			value = ($('input[name="' + $this.attr("name") + '"]:checked').length > 0 ? value : "");
		}
		return value;
	};

  function regexFromString(inputstring) {
		return new RegExp("^" + inputstring + "$");
	}

  /**
   * Thanks to Jason Bunting via StackOverflow.com
   *
   * http://stackoverflow.com/questions/359788/how-to-execute-a-javascript-function-when-i-have-its-name-as-a-string#answer-359910
   * Short link: http://tinyurl.com/executeFunctionByName
  **/
  function executeFunctionByName(functionName, context /*, args*/) {
    var args = Array.prototype.slice.call(arguments).splice(2);
    var namespaces = functionName.split(".");
    var func = namespaces.pop();
    for(var i = 0; i < namespaces.length; i++) {
      context = context[namespaces[i]];
    }
    return context[func].apply(this, args);
  }

	$.fn.jqBootstrapValidation = function( method ) {

		if ( defaults.methods[method] ) {
			return defaults.methods[method].apply( this, Array.prototype.slice.call( arguments, 1 ));
		} else if ( typeof method === 'object' || ! method ) {
			return defaults.methods.init.apply( this, arguments );
		} else {
		$.error( 'Method ' +  method + ' does not exist on jQuery.jqBootstrapValidation' );
			return null;
		}

	};

  $.jqBootstrapValidation = function (options) {
    $(":input").not("[type=image],[type=submit]").jqBootstrapValidation.apply(this,arguments);
  };

})( jQuery );
;angular.module('deitel.controllers', ['nvd3','ngSanitize', 'ui.select'])


// .controller('OneCtrl', ['$window','$timeout','$location','$scope','$routeParams','$filter','$log','$sampleservice','$burl','$base', 
// 	function($window,$timeout,$location,$scope,$routeParams,$filter,$log,$sampleservice,$burl,$base){
// 		console.log('begin OneCtrl ....');
// 		$scope.startDate = new Date(2014,0,1);
// 		$scope.endDate = new Date(2014,12,1);

// 		$scope.ftype = {};
// 	  $scope.ftype.itemArray = [
//       {id: 0, name: '아파트'},
//       {id: 1, name: '연립/다세대'},
//     ];
//   	$scope.ftype.selectedItem = $scope.ftype.itemArray[0];

// 		$scope.fmetric = {};
// 	  $scope.fmetric.itemArray = [
//       {id: 0, name: '거래량', unit:'건'},
//       {id: 1, name: '평당가격', unit:'천만원'},
//     ];
//   	$scope.fmetric.selectedItem = $scope.fmetric.itemArray[0];

// 		$scope.farea = {};
// 	  $scope.farea.itemArray = [
//       {id: 0, name: '서울'},
//       // {id: 1, name: '경기'},
//     ];
//   	$scope.farea.selectedItem = $scope.farea.itemArray[0];

// 		// var center = [37.530101531765394,127.00181143188475]; // 한강 중심 

// 		$scope.map = L.map('map', {
// 						crs: L.Proj.CRS.TMS.Daum,
// 						continuousWorld: true,
// 						worldCopyJump: false,
// 						zoomControl: true
// 					}).setView([37.53800253054263,127.01608766689583], 6),
// 		// console.log($scope.map);
// 		$scope.map.doubleClickZoom.disable();
// 		$scope.map.scrollWheelZoom.disable();


// 		L.Proj.TileLayer.TMS.provider('DaumMap.Satellite').addTo( $scope.map );
// 		L.Proj.TileLayer.TMS.provider('DaumMap.Hybrid').addTo( $scope.map );
// 		// L.Proj.TileLayer.TMS.provider('DaumMap.Street').addTo( $scope.map );

// 		$scope.focusmap = L.map('focusmap', {
// 						crs: L.Proj.CRS.TMS.Daum,
// 						continuousWorld: true,
// 						worldCopyJump: false,
// 						zoomControl: true
// 					}).setView([37.49800253054263,127.02608766689583], 6),
// 		$scope.focusmap.doubleClickZoom.disable();
// 		$scope.focusmap.scrollWheelZoom.disable();

// 		L.Proj.TileLayer.TMS.provider('DaumMap.Street').addTo( $scope.focusmap );
// 		// L.Proj.TileLayer.TMS.provider('DaumMap.Hybrid').addTo( $scope.focusmap );

// 		$scope.drawStart = function(){
// 			console.log('------> drawStart ');
// 			var promise = $sampleservice.listMainMap();
// 			promise.then(function(data){
// 				// $scope.mapdata = JSON.parse(data[0].m1);
// 				$log.log('----$scope.listMainMap in sampleCtrl -----');
// 				$log.log(data);
// 				$timeout(function(){
// 					$scope.mainmapdata = data;
// 					$scope.drawMainMap();
// 				}, 300);
// 			});
// 		};
		

// 		$scope.drawMainMap = function(){

// 			// var ext = d3.extent(data,function(d){ return d.value; });
// 			// console.log(ext);
// 			var options = {
// 				radius: 15,
// 				opacity: .72,
// 				duration: 200,
// 				lng: function(d){ return d.lng; },
// 				lat: function(d){ return d.lat; },
// 				value: function(d1){ 
// 					// console.log(d1); 
// 					var mm = d3.mean(d1.map(function(d){ return d.o['value'].split(':')[$scope.fmetric.selectedItem.id]; }));
// 					// console.log(mm);
// 					return mm; 
// 				},
// 				valueFloor:undefined,
// 				valueCeil: undefined,
// 				onclick:function(d){ 
// 					var cclng = d3.mean(d, function(c){ return c.o['lng']; }),
// 							cclat = d3.mean(d, function(c){ return c.o['lat']; });
// 							console.log(cclng + ':' + cclat);
// 					$scope.focusmap.setView([cclat,cclng], 9); 
// 					// console.log(d); $scope.drawDetailMap(d)
// 					cclat = Math.round(cclat*100)/100, cclng = Math.round(cclng*100)/100; 
// 					var ss = $scope.rolledmapdata.filter(function(d){  return parseFloat(d.key)==parseFloat(cclat); })[0]['values'].filter(function(d){ return parseFloat(d.key)==parseFloat(cclng); });
// 		  		// // console.log(ss[0]['values']); 
// 		  		try{
// 		  			$scope.drawDetailMap2(ss[0]['values']);
// 		  		}catch(e){
// 		  			console.log('plz center move..')
// 		  		}
// 					$timeout(function(){
// 						$('html, body').animate({
// 				        scrollTop: $("#schoolmap").offset().top
// 				    }, 500);
// 					},500);		

// 				}
// 			}
// 			var hexLayer = L.hexbinLayer(options).addTo($scope.map);
// 			hexLayer.colorScale().range(['#ffeda0','#feb24c','#fc4e2a','#bd0026','#800026']);
// 			// hexLayer.colorScale().range(['#ffeda0','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#bd0026','#800026']);
// 			// console.log(data);
// 			hexLayer.data($scope.mainmapdata);

// 			$scope.rolledmapdata = d3.nest().key(function(d){ 
// 				return Math.round(d.lat*100)/100 ; 
// 			}).key(function(d){ 
// 				return Math.round(d.lng*100)/100 ; 				
// 			}).entries($scope.mainmapdata);
// 			console.log($scope.rolledmapdata);

// 		}



// 		$scope.detailmarkerlst=[];
// 		$scope.drawDetailMap = function(data){
// 			$scope.detailmarkerlst.forEach(function(d){
// 				$scope.focusmap.removeLayer(d);	
// 			});
			
// 			var markers = new L.FeatureGroup();
// 			var SweetIcon = L.Icon.Label.extend({
// 				options: {
// 					iconUrl: 'views/s.png',
// 					shadowUrl: null,
// 					iconSize: new L.Point(24, 24),
// 					iconAnchor: new L.Point(0, 1),
// 					labelAnchor: new L.Point(26, 0),
// 					wrapperAnchor: new L.Point(12, 13),
// 					labelClassName: 'sweet-deal-label'
// 				}
// 			});

// 			data.forEach(function(d){
// 				var info = '<table class="table table-striped table-hover" style="color:#000"><thead><tr class="info" style="color:#000"><td>아파트명</td><td>'+$scope.fmetric.selectedItem.name+'</td></tr></thead><tbody><tr><td><a href="#" onclick="drawChart(\''+d.o['series']+'/'+d.o['si_series']+'/'+d.o['gu_series']+'\')">'+d.o['aptnm']+')'+'</a></td><td>'+Math.round(d.o['value'].split(':')[$scope.fmetric.selectedItem.id])+'</td></tr></tbody></table>';
// 				markers.addLayer(
// 					new L.Marker(new L.LatLng(d.o['lat'],d.o['lng']),{ icon: new SweetIcon({ labelText: d.o['aptnm'] }) }).bindPopup(info)
// 					);
// 			});
// 			$scope.detailmarkerlst.push(markers);
// 			$scope.focusmap.addLayer(markers);
// 		}
// 		$scope.detailmarkerlst2=[];
// 		$scope.drawDetailMap2 = function(data){
// 			$scope.detailmarkerlst2.forEach(function(d){
// 				$scope.focusmap.removeLayer(d);	
// 			});
			
// 			var markers = new L.FeatureGroup();
// 			var SweetIcon = L.Icon.Label.extend({
// 				options: {
// 					iconUrl: 'views/s.png',
// 					shadowUrl: null,
// 					iconSize: new L.Point(24, 24),
// 					iconAnchor: new L.Point(0, 1),
// 					labelAnchor: new L.Point(26, 0),
// 					wrapperAnchor: new L.Point(12, 13),
// 					labelClassName: 'sweet-deal-label'
// 				}
// 			});

// 			data.forEach(function(d){
// 				var info = '<table class="table table-striped table-hover" style="color:#000"><thead><tr class="info" style="color:#000"><td>아파트명</td><td>'+$scope.fmetric.selectedItem.name+'</td></tr></thead><tbody><tr><td><a href="#" onclick="drawChart(\''+d['series']+'/'+d['si_series']+'/'+d['gu_series']+'/'+ d['avrprice']+'\')">'+d['aptnm']+')'+'</a></td><td>'+Math.round(d['value'].split(':')[$scope.fmetric.selectedItem.id])+'</td></tr></tbody></table>';
// 				markers.addLayer(
// 					new L.Marker(new L.LatLng(d['lat'],d['lng']),{ icon: new SweetIcon({ labelText: d['aptnm'] }) }).bindPopup(info)
// 					);
// 			});
// 			$scope.detailmarkerlst2.push(markers);
// 			$scope.focusmap.addLayer(markers);
// 		}

// 		$scope.options = {
//       chart: {
//         type: 'multiBarChart',
//         height: 650,
//         margin : {
//           top: 20,
//           right: 20,
//           bottom: 60,
//           left: 65
//         },
//         x: function(d){ return (new Date(d[0].substr(0,4), d[0].substr(4,2), d[0].substr(6,2))).getTime() ; },
//         y: function(d){ return parseFloat(d[1]); },
//         // average: function(d) { return d.mean; },
//         color: d3.scale.category10().range(),
//         transitionDuration: 300,
//         stacked: false,
//         duration: 500,
//         xAxis: {
//           axisLabel: '기간',
//           tickFormat: function(d) {
//             return d3.time.format('%Y%m%d')(new Date(d));
//           },
//           showMaxMin: true,
//           staggerLabels: true
//         },

//         yAxis: {
//           axisLabel: '거래량(건)',
//           tickFormat: function(d){
//               return d3.format('d')(d);
//           },
//           showMaxMin: true,
//           axisLabelDistance: -20
//         }
//       }
//     };

// 		$window.drawChart = function(data){
// 			// console.log(data);
// 			var datecomp = function(b,a){
// 				return new Date(b.split(':')[0].substr(0,4)+'/'+b.split(':')[0].substr(4,2)+'/01') - new Date(a.split(':')[0].substr(0,4)+'/'+a.split(':')[0].substr(4,2)+'/01');
// 			};

// 			var my = data.split('/')[0].split(','),
// 				  si = data.split('/')[1].split(','),
// 				  gu = data.split('/')[2].split(','),
// 				  avrprice = data.split('/')[3].split(',');
// 			$window.drawAreaChart(avrprice); // area chart draw 	  
// 			si.sort(datecomp), gu.sort(datecomp);		
// 			// console.log(si);
// 			var fullm = {}, minm = moment(new Date(parseInt(si[0].split(':')[0].substr(0,4)), parseInt(si[0].split(':')[0].substr(4,2))-1, 1));
// 			// var fullm = {}, minm = moment($scope.startDate);
// 			// console.log(si.length);
// 			for(var k=0;k<si.length;k++){
// 				fullm[minm.format('YYYYMMDD')] = {si:0,gu:0,my:0};
// 				minm.add(1,'month');
// 			}

// 			for(var k=0;k<si.length;k++){
// 				// console.log(si[k].split(':')[0]+'01');
// 				fullm[si[k].split(':')[0]+'01']['si'] =  si[k].split(':')[$scope.fmetric.selectedItem.id+1];
// 			}
// 			for(var k=0;k<gu.length;k++){
// 				fullm[gu[k].split(':')[0]+'01']['gu'] =  gu[k].split(':')[$scope.fmetric.selectedItem.id+1];
// 			}
// 			for(var k=0;k<my.length;k++){
// 				fullm[my[k].split(':')[0]+'01']['my'] =  my[k].split(':')[$scope.fmetric.selectedItem.id+1];
// 			}
// 			var data = [];
// 			var s1 =[], s2=[],s3=[];
// 			Object.keys(fullm).map(function(d){
// 				s1.push([d, fullm[d]['my']]);
// 				s2.push([d, fullm[d]['si']]);
// 				s3.push([d, fullm[d]['gu']]);
// 			})

// 			$scope.$apply(function(){
// 				$scope.options.chart.yAxis.axisLabel = $scope.fmetric.selectedItem.name + '('+$scope.fmetric.selectedItem.unit + ')';
// 				// $scope.data = [];
// 				$scope.data = [{key:'아파트',values:s1},{key:'시평균',values:s2},{key:'구평균',values:s3}];
// 				console.log($scope.data);		

// 			});

// 			$timeout(function(){
// 					$scope.api.update();
// 					$scope.api.refresh();
// 					console.log('updated... but not..');
// 					$('html, body').animate({
// 			        scrollTop: $("#bchart").offset().top
// 			    }, 500);
// 				},500);		
// 		}
// 		$scope.options2 = _.clone($scope.options);
// 		$window.drawAreaChart = function(data){
// 			console.log('$window.drawAreaChart -----> ')
// 			console.log(data);
// 			if($scope.fmetric.selectedItem.id==1){
// 				$scope.options2.chart.yAxis.axisLabel = '평형별 가격(원)';	
// 			}
			
// 			var aa = d3.nest()
// 					.key(function(d){ return d.split(':')[0]; })
// 					.key(function(d){ return d.split(':')[1]; })
// 					.entries(data);
// 			console.log(aa);
// 			var fullm = {}, minm = moment($scope.startDate);
// 			// console.log(si.length);
// 			for(var k=0;k<12;k++){
// 				fullm[minm.format('YYYYMMDD')] = 0;
// 				minm.add(1,'month');
// 			}
// 			$scope.$apply(function(){
// 				$scope.adata = aa.map(function(a){
// 					var fu = _.clone(fullm);
// 					var vv = a.values;
// 					var nv = [];
// 					Object.keys(fu).map(function(d){
// 						var vl = vv.filter(function(v){ return d == v.key+'01'; })[0];
// 						// console.log(vl);
// 						var a1 = 0;
// 						if(vl){
// 							a1 = vl.values[0].split(':')[$scope.fmetric.selectedItem.id+2]; // 거래량 
// 						}else{
// 							a1 = 0;
// 						}
// 						nv.push([d, a1]);
// 					});
// 					return  {'key':a.key, 'values':nv};
// 				});
// 			});
			
// 			$timeout(function(){
// 					$scope.aapi.update();
// 					$scope.aapi.refresh();
// 					// console.log('updated... but not..');
// 					// $('html, body').animate({
// 			  //       scrollTop: $("#achart").offset().top
// 			  //   }, 1500);
// 				},1500);	
// 		}


// 	var mapGeostruc = {
// 		"type":"FeatureCollection", "features":[], 
// 		"properties":{
// 			"fields":{
// 				"category":{"name":"badcategory","lookup":{"1":"Poor","2":"Fair","3":"Good","4":"Very Good","5":"Excellent"}}
// 			}, "attribution":"PIZZASTUDIO 2015 Inc."
// 		}
// 	},
//   categoryField = 'badcategory', //This is the fieldname for marker category (used in the pie and legend)
//   iconField = 'badcategory', //This is the fieldame for marker icon
//   rmax = 30; //Maximum radius for cluster pies
//   $scope.metadata = _.clone(mapGeostruc.properties);
  
// 	$scope.defineFeature=function(feature, latlng) {
// 		// console.log('defineFeature---->');
// 		// console.log(feature);
// 	  var categoryVal = feature.properties[categoryField],
// 	    iconVal = feature.properties[categoryField];
// 	    // console.log(categoryVal+ ':' + iconVal);
// 	    var myClass = 'marker category-'+categoryVal+' icon-'+iconVal;
// 	    var myIcon = L.divIcon({
// 	        className: myClass,
// 	        iconSize:null
// 	    });
// 	    return L.marker(latlng, {icon: myIcon});
// 	}

// 	$scope.defineFeaturePopup = function(feature, layer) {
// 		// console.log('defineFeaturePopup---->');
// 	  var props = feature.properties;
// 	  // var subwaytxt = props['subway'] && props['subway']!='not' ? ' [' + props['subway'] +']' : '';
// 		var infocontent = '<table class="table table-striped table-hover text-center"><thead style="color:#fff;"><tr><td>학교명</td><td>주소</td></tr></thead><tbody><tr><td class="success" style="cursor:pointer;text-decoration: underline;">'+props['name']+'</td><td class="danger">'+props['addr']+'</td></tr></tbody></table>';
// 	  layer.bindPopup(infocontent,{offset: L.point(1,-2), maxWidth: 700});
// 	}

// 	$scope.defineClusterIcon = function(cluster) {
// 		// console.log('defineClusterIcon---->');
//     var children = cluster.getAllChildMarkers(),
//         n = children.length, //Get number of markers in cluster
//         strokeWidth = 1, //Set clusterpie stroke width
//         r = rmax-2*strokeWidth-(n<10?12:n<100?8:n<1000?4:0), //Calculate clusterpie radius...
//         iconDim = (r+strokeWidth)*2, //...and divIcon dimensions (leaflet really want to know the size)
//         data = d3.nest() //Build a dataset for the pie chart
//           .key(function(d) { return d.feature.properties[categoryField]; })
//           .entries(children, d3.map),
//         //bake some svg markup
//         html = $scope.bakeThePie({ 
//         	data: data,
//           valueFunc: function(d){ return d.values.length;  }, 
//           legendFunc: function(d){ 
//           	var ccc = 0, ooo=0;;
//           	d.forEach(function(o){
//         			ccc += o.values.filter(function(a){return a.feature.properties.tci >= 0.3; }).length;
//         			ooo += o.values.length;
//           	});
//           	return ccc/ooo*100;
//           }, 
//           strokeWidth: 1,
//           outerRadius: r,
//           innerRadius: r-10,
//           pieClass: 'cluster-pie',
//           pieLabel: n,
//           pieLabelClass: 'marker-cluster-pie-label',
//           pathClassFunc: function(d){return "category-"+d.data.key;},
//           pathTitleFunc: function(d){return console.log(''); $scope.metadata.fields[categoryField].lookup[d.data.key];}
//         }),
//         //Create a new divIcon and assign the svg markup to the html property
//         myIcon = new L.DivIcon({
//             html: html,
//             className: 'marker-cluster', 
//             iconSize: new L.Point(iconDim, iconDim)
//         });
//     return myIcon;
// 	}

// 	/*function that generates a svg markup for the pie chart*/
// 	$scope.bakeThePie = function(options) {
// 		// console.log('bakeThePie---->');
// 	    /*data and valueFunc are required*/
// 	    if (!options.data || !options.valueFunc) {
// 	        return '';
// 	    }
// 	    var data = options.data,
// 	        valueFunc = options.valueFunc,
// 	        legendFunc = options.legendFunc,
// 	        r = options.outerRadius?options.outerRadius:28, //Default outer radius = 28px
// 	        rInner = options.innerRadius?options.innerRadius:r-10, //Default inner radius = r-10
// 	        strokeWidth = options.strokeWidth?options.strokeWidth:1, //Default stroke is 1
// 	        pathClassFunc = options.pathClassFunc?options.pathClassFunc:function(){return '';}, //Class for each path
// 	        pathTitleFunc = options.pathTitleFunc?options.pathTitleFunc:function(){return '';}, //Title for each path
// 	        pieClass = options.pieClass?options.pieClass:'marker-cluster-pie', //Class for the whole pie
// 	        pieLabel = options.pieLabel?options.pieLabel:d3.sum(data,valueFunc), //Label for the whole pie
// 	        // pieLabel = legendFunc?legendFunc:options.pieLabel, 
// 	        pieLabelClass = options.pieLabelClass?options.pieLabelClass:'marker-cluster-pie-label',//Class for the pie label	        
// 	        origo = (r+strokeWidth), //Center coordinate
// 	        w = origo*2, //width and height of the svg element
// 	        h = w,
// 	        donut = d3.layout.pie(),
// 	        arc = d3.svg.arc().innerRadius(rInner).outerRadius(r);
	        
// 	    //Create an svg element
// 	    var svg = document.createElementNS(d3.ns.prefix.svg, 'svg');
// 	    //Create the pie chart
// 	    var vis = d3.select(svg)
// 	        .data([data])
// 	        .attr('class', pieClass)
// 	        .attr('width', w)
// 	        .attr('height', h);
	        
// 	    var arcs = vis.selectAll('g.arc')
// 	        .data(donut.value(valueFunc))
// 	        .enter().append('svg:g')
// 	        .attr('class', 'arc')
// 	        .attr('transform', 'translate(' + origo + ',' + origo + ')');
	    
// 	    arcs.append('svg:path')
// 	        .attr('class', pathClassFunc)
// 	        .attr('stroke-width', strokeWidth)
// 	        .attr('d', arc)
// 	        .append('svg:title')
// 	          .text(pathTitleFunc);

// 			if(legendFunc(data)	> 1 ){
// 				vis.append('circle')
// 						.attr('r', rInner)
// 						.attr('cx', origo)
// 						.attr('cy', origo)
// 						.attr('fill', '#4d4d4d');							
// 		    vis.append('text')
// 		        .attr('x',origo)
// 		        .attr('y',origo)
// 		        .attr('class', pieLabelClass)
// 		        .attr('text-anchor', 'middle')
// 		        .attr('dy','.3em')
// 		        .attr('fill', 'white')
// 		        .text(pieLabel);						
// 			}else{
// 		    vis.append('text')
// 		        .attr('x',origo)
// 		        .attr('y',origo)
// 		        .attr('class', pieLabelClass)
// 		        .attr('text-anchor', 'middle')
// 		        .attr('dy','.3em')
// 		        .text(pieLabel);					
// 			}

// 	    return $scope.serializeXmlNode(svg);
// 	}

// 	/*Helper function*/
// 	$scope.serializeXmlNode=function(xmlNode) {
// 		// console.log(xmlNode);
// 	    if (typeof window.XMLSerializer != "undefined") {
// 	        return (new window.XMLSerializer()).serializeToString(xmlNode);
// 	    } else if (typeof xmlNode.xml != "undefined") {
// 	        return xmlNode.xml;
// 	    }
// 	    return "";
// 	}

// 	$scope.getSchoolData = function(){
// 		console.log('------> drawSchoolMap ');
// 		var promise = $sampleservice.listSchoolMap();
// 		promise.then(function(data){
// 			// $scope.mapdata = JSON.parse(data[0].m1);
// 			$log.log('----$scope.listSchoolMap in OneCtrl -----');
// 			// $log.log(data);
// 			$timeout(function(){
// 				$scope.drawSchoolMap(data);
// 			}, 300);
// 		});
// 	};


//   $scope.markersref = {'c':{}};	
//   $scope.drawSchoolMap = function(data){
//   	console.log('--  begin $scope.drawSchoolMap ----> ');
//   	// console.log(data);
//   	// if(!_.isUndefined($scope.markersref['c'].cluster) && !_.isUndefined($scope.markersref['c'].markers))
// 	  // 	$scope.markersref['c'].cluster.removeLayer($scope.markersref['c'].markers);

//   	var max = d3.extent(data, function(d){ return d.rn;});
//   	console.log(max);
//   	$scope.cellgeojson = _.clone(mapGeostruc);
//   	$scope.rnscale = d3.scale.quantize().domain(max).range(['5','4','3','2','1']);
//   	$scope.cellgeojson.features = data.map(function(d){ return {"geometry":{"type":"Point","coordinates":[d.lng,d.lat]}, "type":"Feature", "properties":{"badcategory":$scope.rnscale(d.rn),"name":d.name,"addr":d.addr}}});
//   	console.log($scope.rnscale(1));console.log($scope.rnscale(324));
//   	// console.log(JSON.stringify(cellgeojson));
//   	// console.log((cellgeojson));
//   	$scope.markers = L.geoJson($scope.cellgeojson, {
// 				pointToLayer: $scope.defineFeature,
// 				onEachFeature: $scope.defineFeaturePopup
//     });
// 		$scope.markerclusters = L.markerClusterGroup({
// 		  	maxClusterRadius: 2*rmax,
// 		    iconCreateFunction: $scope.defineClusterIcon
// 		});
// 		// console.log($scope.defineClusterIcon);
// 		// console.log(markerclusters.iconCreateFunction);
// 		$scope.markerclusters.addTo($scope.focusmap);
// 		// console.log($scope.markerclusters);
//     $scope.markerclusters.addLayer($scope.markers);
//     $scope.markersref['c'].cluster = $scope.markerclusters;
//     $scope.markersref['c'].markers = $scope.markers;
//     $scope.focusmap.attributionControl.addAttribution($scope.metadata.attribution);

//   }
//   $scope.getSchoolData();


// 	var dragging = false;

//   $scope.focusmap.on('dragend', function(e){
//   	if(dragging) {
//   		return;
//   	}

//   	$timeout(function(){
//   		var cc = $scope.focusmap.getCenter();
//   		var clat = Math.round(cc.lat*100)/100, clng = Math.round(cc.lng*100)/100; 
//   		console.log(clat +'/'+ clng);  		
//   		var ss = $scope.rolledmapdata.filter(function(d){  return parseFloat(d.key)==clat; })[0]['values'].filter(function(d){ return parseFloat(d.key)==clng; });
//   		// console.log(ss[0]['values']); 
//   		try{
//   			$scope.drawDetailMap2(ss[0]['values']);
//   		}catch(e){
//   			console.log('plz center move..')
//   		}
  		

//   	}, 500);
//   });

// }]) // end of OneController 

.controller('TwoCtrl', ['$window','$timeout','$location','$scope','$routeParams','$filter','$log','$sampleservice','$burl','$base', 
	function($window,$timeout,$location,$scope,$routeParams,$filter,$log,$sampleservice,$burl,$base){
		console.log('begin OneCtrl ....');
		$scope.startDate = new Date(2014,0,1);
		$scope.endDate = new Date(2014,12,1);

		$scope.ftype = {};
	  $scope.ftype.itemArray = [
      {id: 0, name: '매매'},
      // {id: 1, name: '전월세'},
    ];
  	$scope.ftype.selectedItem = $scope.ftype.itemArray[0];

		$scope.fmetric = {};
	  $scope.fmetric.itemArray = [
      {id: 0, name: '거래량', unit:'건'},
      {id: 1, name: '평당가격', unit:'천만원'},
    ];
  	$scope.fmetric.selectedItem = $scope.fmetric.itemArray[1];

		$scope.farea = {};
	  $scope.farea.itemArray = [
      {id: 1, name: '서울', latlng:[37.53800253054263,127.01608766689583], zoom: 5},
      {id: 2, name: '경기', latlng:[37.53800253054263,127.01608766689583], zoom: 3},
    ];
  	$scope.farea.selectedItem = $scope.farea.itemArray[0];

		// var center = [37.530101531765394,127.00181143188475]; // 한강 중심 

		$scope.map = L.map('_map', {
						crs: L.Proj.CRS.TMS.Daum,
						continuousWorld: true,
						worldCopyJump: false,
						zoomControl: true
					}).setView([37.53800253054263,127.01608766689583], 5),
		// console.log($scope.map);
		$scope.map.doubleClickZoom.disable();
		$scope.map.scrollWheelZoom.disable();


		L.Proj.TileLayer.TMS.provider('DaumMap.Satellite').addTo( $scope.map );
		L.Proj.TileLayer.TMS.provider('DaumMap.Hybrid').addTo( $scope.map );
		// L.Proj.TileLayer.TMS.provider('DaumMap.Street').addTo( $scope.map );

		$scope.schoolmap = L.map('_schoolmap', {
						crs: L.Proj.CRS.TMS.Daum,
						continuousWorld: true,
						worldCopyJump: false,
						zoomControl: true
					}).setView([37.53800253054263,127.01608766689583], 5),
		// console.log($scope.schoolmap);
		$scope.schoolmap.doubleClickZoom.disable();
		$scope.schoolmap.scrollWheelZoom.disable();


		L.Proj.TileLayer.TMS.provider('DaumMap.Satellite').addTo( $scope.schoolmap );
		L.Proj.TileLayer.TMS.provider('DaumMap.Hybrid').addTo( $scope.schoolmap );
		// L.Proj.TileLayer.TMS.provider('DaumMap.Street').addTo( $scope.map );

		$scope.gasungbimap = L.map('_gasungbimap', {
						crs: L.Proj.CRS.TMS.Daum,
						continuousWorld: true,
						worldCopyJump: false,
						zoomControl: true
					}).setView([37.53800253054263,127.01608766689583], 5),
		// console.log($scope.schoolmap);
		$scope.gasungbimap.doubleClickZoom.disable();
		$scope.gasungbimap.scrollWheelZoom.disable();


		L.Proj.TileLayer.TMS.provider('DaumMap.Satellite').addTo( $scope.gasungbimap );
		L.Proj.TileLayer.TMS.provider('DaumMap.Hybrid').addTo( $scope.gasungbimap );
		// L.Proj.TileLayer.TMS.provider('DaumMap.Street').addTo( $scope.map );


		$scope.focusmap = L.map('_focusmap', {
						crs: L.Proj.CRS.TMS.Daum,
						continuousWorld: true,
						worldCopyJump: false,
						zoomControl: true
					}).setView([37.53800253054263,127.01608766689583], 5),
		$scope.focusmap.doubleClickZoom.disable();
		$scope.focusmap.scrollWheelZoom.disable();

		L.Proj.TileLayer.TMS.provider('DaumMap.Street').addTo( $scope.focusmap );
		// L.Proj.TileLayer.TMS.provider('DaumMap.Hybrid').addTo( $scope.focusmap );

		$scope.drawStart = function(){
			console.log('------> drawStart ');
			var promise = $sampleservice.listMainMap([], $scope.farea.selectedItem.id);
			promise.then(function(data){
				// $scope.mapdata = JSON.parse(data[0].m1);
				$log.log('----$scope.listMainMap in sampleCtrl -----');
				$log.log(data);
				$timeout(function(){
					$scope.mainmapdata = data;
					$scope.drawMainMap();
					$scope.getSchoolData();
					$scope.getGasungbiMap();
				}, 300);
			});
		};
		
		// 		$scope.detailmarkerlst=[];
// 		$scope.drawDetailMap = function(data){
// 			$scope.detailmarkerlst.forEach(function(d){
// 				$scope.focusmap.removeLayer(d);	
// 			});
		$scope.mainmapmarkerlst = [];
		$scope.drawMainMap = function(){
			$scope.mainmapmarkerlst.forEach(function(d){
				$scope.map.removeLayer(d);
			});
			$scope.map.setView($scope.farea.selectedItem.latlng, $scope.farea.selectedItem.zoom);
			// var ext = d3.extent(data,function(d){ return d.value; });
			// console.log(ext);
			var options = {
				radius: 15,
				opacity: .72,
				duration: 200,
				lng: function(d){ return d.lng; },
				lat: function(d){ return d.lat; },
				value: function(d1){ 
					// console.log(d1); 
					var mm = d3.mean(d1.map(function(d){ return d.o['value'].split(':')[$scope.fmetric.selectedItem.id]; }));
					// console.log(mm);
					return mm; 
				},
				valueFloor:undefined,
				valueCeil: undefined,
				onclick:function(d){ 
					var cclng = d3.mean(d, function(c){ return c.o['lng']; }),
							cclat = d3.mean(d, function(c){ return c.o['lat']; });
							console.log(cclng + ':' + cclat);
					$scope.focusmap.setView([cclat,cclng], 9); 
					// console.log(d); $scope.drawDetailMap(d)
					cclat = Math.round(cclat*100)/100, cclng = Math.round(cclng*100)/100; 
					var ss = $scope.rolledmapdata.filter(function(d){  return parseFloat(d.key)==parseFloat(cclat); })[0]['values'].filter(function(d){ return parseFloat(d.key)==parseFloat(cclng); });
		  		// // console.log(ss[0]['values']); 
		  		try{
		  			$scope.drawDetailMap2(ss[0]['values']);
		  		}catch(e){
		  			console.log('plz center move..')
		  		}
					$timeout(function(){
						$('html, body').animate({
				        scrollTop: $("#focusmap").offset().top
				    }, 500);
					},500);		

				}
			}
			var hexLayer = L.hexbinLayer(options).addTo($scope.map);
			hexLayer.colorScale().range(['#ffeda0','#feb24c','#fc4e2a','#bd0026','#800026']);
			// hexLayer.colorScale().range(['#ffeda0','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#bd0026','#800026']);
			// console.log(data);
			hexLayer.data($scope.mainmapdata);
			$scope.mainmapmarkerlst.push(hexLayer);

			$scope.rolledmapdata = d3.nest().key(function(d){ 
				return Math.round(d.lat*100)/100 ; 
			}).key(function(d){ 
				return Math.round(d.lng*100)/100 ; 				
			}).entries($scope.mainmapdata);
			console.log($scope.rolledmapdata);
			

		} // end of drawMainMap()

		$scope.schoolmapmarkerlst = [];
		$scope.drawSchoolGradeMap = function(__data){
			console.log('$scope.drawSchoolGradeMap--->');
			$scope.schoolmapmarkerlst.forEach(function(d){
				$scope.schoolmap.removeLayer(d);
			});
			// console.log(__data);
			$scope.schoolmap.setView($scope.farea.selectedItem.latlng, $scope.farea.selectedItem.zoom);
			var options = {
				radius: 15,
				opacity: .72,
				duration: 200,
				lng: function(d){ return d.lng; },
				lat: function(d){ return d.lat; },
				value: function(d1){ 
					// console.log(d1); 
					var mm = d3.mean(d1.map(function(d){ return d.o['rn']; }));
					// console.log(mm);
					return mm; 
				},
				valueFloor:undefined,
				valueCeil: undefined,
				onclick:function(d){ 
					var cclng = d3.mean(d, function(c){ return c.o['lng']; }),
							cclat = d3.mean(d, function(c){ return c.o['lat']; });
							console.log(cclng + ':' + cclat);
					$scope.focusmap.setView([cclat,cclng], 9); 
					// console.log(d); $scope.drawDetailMap(d)
					cclat = Math.round(cclat*100)/100, cclng = Math.round(cclng*100)/100; 
					var ss = $scope.rolledmapdata.filter(function(d){  return parseFloat(d.key)==parseFloat(cclat); })[0]['values'].filter(function(d){ return parseFloat(d.key)==parseFloat(cclng); });
		  		// console.log(ss[0]['values']); 
		  		try{
		  			$scope.drawDetailMap2(ss[0]['values']);
		  		}catch(e){
		  			console.log('plz center move..')
		  		}
					$timeout(function(){
						$('html, body').animate({
				        scrollTop: $("#focusmap").offset().top
				    }, 500);
					},500);		

				}
			}
			var hexLayer = L.hexbinLayer(options).addTo($scope.schoolmap);
			hexLayer.colorScale().range(['#800026','#bd0026','#fc4e2a','#feb24c','#ffeda0']);
			// hexLayer.colorScale().range(['#ffeda0','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#bd0026','#800026']);
			// console.log(data);
			$scope.schoolmapmarkerlst.push(hexLayer);
			hexLayer.data(__data);
			

		} // end of drawSchoolMap()

		$scope.gasungbimapmarkerlst = [];
		$scope.getGasungbiMap = function(){
			console.log('------> getGasungbiMap ');

			var promise = $sampleservice.listGasungbiMap([], $scope.farea.selectedItem.id);
			promise.then(function(data){
				// $scope.mapdata = JSON.parse(data[0].m1);
				$log.log('----$scope.listGasungbiMap in OneCtrl -----');
				// $log.log(data);
				$timeout(function(){
					$scope.drawGasungbiMap(data);
				}, 300);
			});
		} // end of getGasungbiMap

		$scope.drawGasungbiMap = function(__data){
			// data
			$scope.gasungbimapmarkerlst.forEach(function(d){
				$scope.gasungbimap.removeLayer(d);
			});

			$scope.gasungbimap.setView($scope.farea.selectedItem.latlng, $scope.farea.selectedItem.zoom);
			console.log('$scope.drawGasungbiMap --> ');
			console.log(__data);
			// refine rn dt
			var aptmx = d3.extent(__data.filter(function(d){ return d['typef']=='apt'; }), function(d){ return d['rn']}),
				  schmx = d3.extent(__data.filter(function(d){ return d['typef']=='sch'; }), function(d){ return d['rn']});
			var aptscale = d3.scale.linear().domain(aptmx).range([1,100]),
					schscale = d3.scale.linear().domain(schmx).range([1,100]);
						  
			var options = {
				radius: 15,
				opacity: .72,
				duration: 200,
				lng: function(d){ return d.lng; },
				lat: function(d){ return d.lat; },
				value: function(d1){ 
					// console.log(d1); 
					var aptmm = d3.mean(d1.filter(function(d){ return d.o['typef']=='apt'; }).map(function(d){ return aptscale(d.o['rn']); }));
					var schmm = d3.mean(d1.filter(function(d){ return d.o['typef']=='sch'; }).map(function(d){ return schscale(d.o['rn']); }));
					// console.log(aptmm + ':' +schmm);
					return (_.isUndefined(aptmm)?1:aptmm)+ (_.isUndefined(schmm)?1:schmm); 
				},
				valueFloor:undefined,
				valueCeil: undefined,
				onclick:function(d){ 
					var cclng = d3.mean(d, function(c){ return c.o['lng']; }),
							cclat = d3.mean(d, function(c){ return c.o['lat']; });
							console.log(cclng + ':' + cclat);
					$scope.focusmap.setView([cclat,cclng], 9); 
					// console.log(d); $scope.drawDetailMap(d)
					cclat = Math.round(cclat*100)/100, cclng = Math.round(cclng*100)/100; 
					var ss = $scope.rolledmapdata.filter(function(d){  return parseFloat(d.key)==parseFloat(cclat); })[0]['values'].filter(function(d){ return parseFloat(d.key)==parseFloat(cclng); });
		  		// console.log(ss[0]['values']); 
		  		try{
		  			$scope.drawDetailMap2(ss[0]['values']);
		  		}catch(e){
		  			console.log('plz center move..')
		  		}
					$timeout(function(){
						$('html, body').animate({
				        scrollTop: $("#focusmap").offset().top
				    }, 500);
					},500);		

				}
			}
			var hexLayer = L.hexbinLayer(options).addTo($scope.gasungbimap);
			hexLayer.colorScale().range(['#800026','#bd0026','#fc4e2a','#feb24c','#ffeda0']);
			// hexLayer.colorScale().range(['#ffeda0','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#bd0026','#800026']);
			// console.log(data);
			$scope.gasungbimapmarkerlst.push(hexLayer);
			hexLayer.data(__data);

		}



		$scope.detailmarkerlst2=[];
		$scope.drawDetailMap2 = function(data){
			$scope.detailmarkerlst2.forEach(function(d){
				$scope.focusmap.removeLayer(d);	
			});
			
			var markers = new L.FeatureGroup();
			var SweetIcon = L.Icon.Label.extend({
				options: {
					iconUrl: 'views/s.png',
					shadowUrl: null,
					iconSize: new L.Point(24, 24),
					iconAnchor: new L.Point(0, 1),
					labelAnchor: new L.Point(26, 0),
					wrapperAnchor: new L.Point(12, 13),
					labelClassName: 'sweet-deal-label'
				}
			});

			data.forEach(function(d){
				var info = '<table class="table table-striped table-hover" style="color:#000"><thead><tr class="info" style="color:#000"><td>아파트명</td><td>'+$scope.fmetric.selectedItem.name+'</td></tr></thead><tbody><tr><td><a href="#" onclick="drawChart(\''+d['series']+'/'+d['si_series']+'/'+d['gu_series']+'/'+ d['avrprice']+'\')">'+d['aptnm']+')'+'</a></td><td>'+Math.round(d['value'].split(':')[$scope.fmetric.selectedItem.id])+'</td></tr></tbody></table>';
				markers.addLayer(
					new L.Marker(new L.LatLng(d['lat'],d['lng']),{ icon: new SweetIcon({ labelText: d['aptnm'] }) }).bindPopup(info)
					);
			});
			$scope.detailmarkerlst2.push(markers);
			$scope.focusmap.addLayer(markers);
		} // end of drawDetailMap2 

		$scope.options = {
      chart: {
        type: 'multiBarChart',
        height: 650,
        margin : {
          top: 20,
          right: 20,
          bottom: 60,
          left: 65
        },
        x: function(d){ return (new Date(d[0].substr(0,4), d[0].substr(4,2), d[0].substr(6,2))).getTime() ; },
        y: function(d){ return parseFloat(d[1]); },
        // average: function(d) { return d.mean; },
        color: d3.scale.category10().range(),
        transitionDuration: 300,
        stacked: false,
        duration: 500,
        xAxis: {
          axisLabel: '기간',
          tickFormat: function(d) {
            return d3.time.format('%Y%m%d')(new Date(d));
          },
          showMaxMin: true,
          staggerLabels: true
        },

        yAxis: {
          axisLabel: '거래량(건)',
          tickFormat: function(d){
              return d3.format('d')(d);
          },
          showMaxMin: true,
          axisLabelDistance: -20
        }
      }
    }; // end of $scope.options

		$window.drawChart = function(data){
			// console.log(data);
			var datecomp = function(b,a){
				return new Date(b.split(':')[0].substr(0,4)+'/'+b.split(':')[0].substr(4,2)+'/01') - new Date(a.split(':')[0].substr(0,4)+'/'+a.split(':')[0].substr(4,2)+'/01');
			};

			var my = data.split('/')[0].split(','),
				  si = data.split('/')[1].split(','),
				  gu = data.split('/')[2].split(','),
				  avrprice = data.split('/')[3].split(',');
			$window.drawAreaChart(avrprice); // area chart draw 	  
			si.sort(datecomp), gu.sort(datecomp);		
			// console.log(si);
			var fullm = {}, minm = moment(new Date(parseInt(si[0].split(':')[0].substr(0,4)), parseInt(si[0].split(':')[0].substr(4,2))-1, 1));
			// var fullm = {}, minm = moment($scope.startDate);
			// console.log(si.length);
			for(var k=0;k<si.length;k++){
				fullm[minm.format('YYYYMMDD')] = {si:0,gu:0,my:0};
				minm.add(1,'month');
			}

			for(var k=0;k<si.length;k++){
				// console.log(si[k].split(':')[0]+'01');
				fullm[si[k].split(':')[0]+'01']['si'] =  si[k].split(':')[$scope.fmetric.selectedItem.id+1];
			}
			for(var k=0;k<gu.length;k++){
				fullm[gu[k].split(':')[0]+'01']['gu'] =  gu[k].split(':')[$scope.fmetric.selectedItem.id+1];
			}
			for(var k=0;k<my.length;k++){
				fullm[my[k].split(':')[0]+'01']['my'] =  my[k].split(':')[$scope.fmetric.selectedItem.id+1];
			}
			var data = [];
			var s1 =[], s2=[],s3=[];
			Object.keys(fullm).map(function(d){
				s1.push([d, fullm[d]['my']]);
				s2.push([d, fullm[d]['si']]);
				s3.push([d, fullm[d]['gu']]);
			})

			$scope.$apply(function(){
				$scope.options.chart.yAxis.axisLabel = $scope.fmetric.selectedItem.name + '('+$scope.fmetric.selectedItem.unit + ')';
				// $scope.data = [];
				$scope.data = [{key:'아파트',values:s1},{key:'시평균',values:s2},{key:'구평균',values:s3}];
				console.log($scope.data);		

			});

			$timeout(function(){
					$scope.api.update();
					$scope.api.refresh();
					console.log('updated... but not..');
					$('html, body').animate({
			        scrollTop: $("#bchart").offset().top
			    }, 500);
				},500);		
		} // end of $window.drawChart


		$scope.options2 = _.clone($scope.options);
		$window.drawAreaChart = function(data){
			console.log('$window.drawAreaChart -----> ')
			console.log(data);
			if($scope.fmetric.selectedItem.id==1){
				$scope.options2.chart.yAxis.axisLabel = '평형별 가격(원)';	
			}
			
			var aa = d3.nest()
					.key(function(d){ return d.split(':')[0]; })
					.key(function(d){ return d.split(':')[1]; })
					.entries(data);
			console.log(aa);
			var fullm = {}, minm = moment($scope.startDate);
			// console.log(si.length);
			for(var k=0;k<12;k++){
				fullm[minm.format('YYYYMMDD')] = 0;
				minm.add(1,'month');
			}
			$scope.$apply(function(){
				$scope.adata = aa.map(function(a){
					var fu = _.clone(fullm);
					var vv = a.values;
					var nv = [];
					Object.keys(fu).map(function(d){
						var vl = vv.filter(function(v){ return d == v.key+'01'; })[0];
						// console.log(vl);
						var a1 = 0;
						if(vl){
							a1 = vl.values[0].split(':')[$scope.fmetric.selectedItem.id+2]; // 거래량 
						}else{
							a1 = 0;
						}
						nv.push([d, a1]);
					});
					return  {'key':a.key, 'values':nv};
				});
			});
			
			$timeout(function(){
					$scope.aapi.update();
					$scope.aapi.refresh();
					// console.log('updated... but not..');
					// $('html, body').animate({
			  //       scrollTop: $("#achart").offset().top
			  //   }, 1500);
				},1500);	
		} // end of $window.drawAreaChart


	var mapGeostruc = {
		"type":"FeatureCollection", "features":[], 
		"properties":{
			"fields":{
				"category":{"name":"badcategory","lookup":{"1":"Poor","2":"Fair","3":"Good","4":"Very Good","5":"Excellent"}}
			}, "attribution":"PIZZASTUDIO 2015 Inc."
		}
	},
  categoryField = 'badcategory', //This is the fieldname for marker category (used in the pie and legend)
  iconField = 'badcategory', //This is the fieldame for marker icon
  rmax = 30; //Maximum radius for cluster pies
  $scope.metadata = _.clone(mapGeostruc.properties);
  
	$scope.defineFeature=function(feature, latlng) {
		// console.log('defineFeature---->');
		// console.log(feature);
	  var categoryVal = feature.properties[categoryField],
	    iconVal = feature.properties[categoryField];
	    // console.log(categoryVal+ ':' + iconVal);
	    var myClass = 'marker category-'+categoryVal+' icon-'+iconVal;
	    var myIcon = L.divIcon({
	        className: myClass,
	        iconSize:null
	    });
	    return L.marker(latlng, {icon: myIcon});
	} // end of $scope.defineFeature

	$scope.defineFeaturePopup = function(feature, layer) {
		// console.log('defineFeaturePopup---->');
	  var props = feature.properties;
	  // var subwaytxt = props['subway'] && props['subway']!='not' ? ' [' + props['subway'] +']' : '';
		var infocontent = '<table class="table table-striped table-hover" style="color:#000"><thead style="color:#fff;"><tr><td>학교명</td><td>주소</td><td>순위</td></tr></thead><tbody><tr><td class="success" style="cursor:pointer;text-decoration: underline;">'+props['name']+'</td><td class="danger">'+props['addr']+'</td><td class="waring">'+props['rank']+'</td></tr></tbody></table>';
	  layer.bindPopup(infocontent,{offset: L.point(1,-2), maxWidth: 700});
	} // end of $scope.defineFeaturePopup

	$scope.defineClusterIcon = function(cluster) {
		// console.log('defineClusterIcon---->');
    var children = cluster.getAllChildMarkers(),
        n = children.length, //Get number of markers in cluster
        strokeWidth = 1, //Set clusterpie stroke width
        r = rmax-2*strokeWidth-(n<10?12:n<100?8:n<1000?4:0), //Calculate clusterpie radius...
        iconDim = (r+strokeWidth)*2, //...and divIcon dimensions (leaflet really want to know the size)
        data = d3.nest() //Build a dataset for the pie chart
          .key(function(d) { return d.feature.properties[categoryField]; })
          .entries(children, d3.map),
        //bake some svg markup
        html = $scope.bakeThePie({ 
        	data: data,
          valueFunc: function(d){ return d.values.length;  }, 
          legendFunc: function(d){ 
          	var ccc = 0, ooo=0;;
          	d.forEach(function(o){
        			ccc += o.values.filter(function(a){return a.feature.properties.tci >= 0.3; }).length;
        			ooo += o.values.length;
          	});
          	return ccc/ooo*100;
          }, 
          strokeWidth: 1,
          outerRadius: r,
          innerRadius: r-10,
          pieClass: 'cluster-pie',
          pieLabel: n,
          pieLabelClass: 'marker-cluster-pie-label',
          pathClassFunc: function(d){return "category-"+d.data.key;},
          pathTitleFunc: function(d){return console.log(''); $scope.metadata.fields[categoryField].lookup[d.data.key];}
        }),
        //Create a new divIcon and assign the svg markup to the html property
        myIcon = new L.DivIcon({
            html: html,
            className: 'marker-cluster', 
            iconSize: new L.Point(iconDim, iconDim)
        });
    return myIcon;
	} // end of $scope.defineClusterIcon

	/*function that generates a svg markup for the pie chart*/
	$scope.bakeThePie = function(options) {
		// console.log('bakeThePie---->');
	    /*data and valueFunc are required*/
	    if (!options.data || !options.valueFunc) {
	        return '';
	    }
	    var data = options.data,
	        valueFunc = options.valueFunc,
	        legendFunc = options.legendFunc,
	        r = options.outerRadius?options.outerRadius:28, //Default outer radius = 28px
	        rInner = options.innerRadius?options.innerRadius:r-10, //Default inner radius = r-10
	        strokeWidth = options.strokeWidth?options.strokeWidth:1, //Default stroke is 1
	        pathClassFunc = options.pathClassFunc?options.pathClassFunc:function(){return '';}, //Class for each path
	        pathTitleFunc = options.pathTitleFunc?options.pathTitleFunc:function(){return '';}, //Title for each path
	        pieClass = options.pieClass?options.pieClass:'marker-cluster-pie', //Class for the whole pie
	        pieLabel = options.pieLabel?options.pieLabel:d3.sum(data,valueFunc), //Label for the whole pie
	        // pieLabel = legendFunc?legendFunc:options.pieLabel, 
	        pieLabelClass = options.pieLabelClass?options.pieLabelClass:'marker-cluster-pie-label',//Class for the pie label	        
	        origo = (r+strokeWidth), //Center coordinate
	        w = origo*2, //width and height of the svg element
	        h = w,
	        donut = d3.layout.pie(),
	        arc = d3.svg.arc().innerRadius(rInner).outerRadius(r);
	        
	    //Create an svg element
	    var svg = document.createElementNS(d3.ns.prefix.svg, 'svg');
	    //Create the pie chart
	    var vis = d3.select(svg)
	        .data([data])
	        .attr('class', pieClass)
	        .attr('width', w)
	        .attr('height', h);
	        
	    var arcs = vis.selectAll('g.arc')
	        .data(donut.value(valueFunc))
	        .enter().append('svg:g')
	        .attr('class', 'arc')
	        .attr('transform', 'translate(' + origo + ',' + origo + ')');
	    
	    arcs.append('svg:path')
	        .attr('class', pathClassFunc)
	        .attr('stroke-width', strokeWidth)
	        .attr('d', arc)
	        .append('svg:title')
	          .text(pathTitleFunc);

			if(legendFunc(data)	> 1 ){
				vis.append('circle')
						.attr('r', rInner)
						.attr('cx', origo)
						.attr('cy', origo)
						.attr('fill', '#4d4d4d');							
		    vis.append('text')
		        .attr('x',origo)
		        .attr('y',origo)
		        .attr('class', pieLabelClass)
		        .attr('text-anchor', 'middle')
		        .attr('dy','.3em')
		        .attr('fill', 'white')
		        .text(pieLabel);						
			}else{
		    vis.append('text')
		        .attr('x',origo)
		        .attr('y',origo)
		        .attr('class', pieLabelClass)
		        .attr('text-anchor', 'middle')
		        .attr('dy','.3em')
		        .text(pieLabel);					
			}

	    return $scope.serializeXmlNode(svg);
	} // end of $scope.bakeThePie

	/*Helper function*/
	$scope.serializeXmlNode=function(xmlNode) {
		// console.log(xmlNode);
	    if (typeof window.XMLSerializer != "undefined") {
	        return (new window.XMLSerializer()).serializeToString(xmlNode);
	    } else if (typeof xmlNode.xml != "undefined") {
	        return xmlNode.xml;
	    }
	    return "";
	} // end of $scope.serializeXmlNode

	$scope.getSchoolData = function(){
		console.log('------> drawSchoolMap ');
		var promise = $sampleservice.listSchoolMap([], $scope.farea.selectedItem.id);
		promise.then(function(data){
			// $scope.mapdata = JSON.parse(data[0].m1);
			$log.log('----$scope.getSchoolData in OneCtrl -----');
			// $log.log(data);
			$timeout(function(){
				$scope.drawSchoolMap(data);
				$scope.drawSchoolGradeMap(data);				
			}, 300);
		});
	}; // end of $scope.getSchoolData


  $scope.markersref = {'c':{}};	
  $scope.drawSchoolMap = function(data){
  	console.log('--  begin $scope.drawSchoolMap ----> ');
  	// console.log(data);
  	if(!_.isUndefined($scope.markersref['c'].cluster) && !_.isUndefined($scope.markersref['c'].markers))
	  	$scope.markersref['c'].cluster.removeLayer($scope.markersref['c'].markers);

  	// var max = d3.extent(data, function(d){ return d.rn;});
  	// console.log(max);
  	var max = [1, 3232];
  	$scope.cellgeojson = _.clone(mapGeostruc);
  	// $scope.rnscale = d3.scale.quantize().domain(max).range(['5','4','3','2','1']);
  	$scope.rnscale = function(d){
  		if(d<101) return '5';
  		else if(d>=101 && d<301) return '4';
  		else if(d>=301 && d<1001) return '3';
  		else if(d>=1001 && d<2001) return '2';
  		else if(d>=2001) return '1';
  	}
  	$scope.cellgeojson.features = data.map(function(d){ return {"geometry":{"type":"Point","coordinates":[d.lng,d.lat]}, "type":"Feature", "properties":{"badcategory":$scope.rnscale(d.rn),"name":d.name,"addr":d.addr,"rank":d.rn}}});
  	console.log($scope.rnscale(1));console.log($scope.rnscale(324));
  	// console.log(JSON.stringify(cellgeojson));
  	// console.log((cellgeojson));
  	$scope.markers = L.geoJson($scope.cellgeojson, {
				pointToLayer: $scope.defineFeature,
				onEachFeature: $scope.defineFeaturePopup
    });
		$scope.markerclusters = L.markerClusterGroup({
		  	maxClusterRadius: 2*rmax,
		    iconCreateFunction: $scope.defineClusterIcon
		});
		// console.log($scope.defineClusterIcon);
		// console.log(markerclusters.iconCreateFunction);
		$scope.markerclusters.addTo($scope.focusmap);
		// console.log($scope.markerclusters);
    $scope.markerclusters.addLayer($scope.markers);
    $scope.markersref['c'].cluster = $scope.markerclusters;
    $scope.markersref['c'].markers = $scope.markers;
    $scope.focusmap.attributionControl.addAttribution($scope.metadata.attribution);

  } // end of $scope.drawSchoolMap

  // $scope.getSchoolData();


	var dragging = false;

  $scope.focusmap.on('dragend', function(e){
  	if(dragging) {
  		return;
  	}

  	$timeout(function(){
  		var cc = $scope.focusmap.getCenter();
  		var clat = Math.round(cc.lat*100)/100, clng = Math.round(cc.lng*100)/100; 
  		console.log(clat +'/'+ clng);  		
  		var ss = $scope.rolledmapdata.filter(function(d){  return parseFloat(d.key)==clat; })[0]['values'].filter(function(d){ return parseFloat(d.key)==clng; });
  		// console.log(ss[0]['values']); 
  		try{
  			$scope.drawDetailMap2(ss[0]['values']);
  		}catch(e){
  			console.log('plz center move..')
  		}
  		

  	}, 500);
  });

}]) // end of TwoController 



;
;angular.module('deitel.services',[])

.factory('$burl', function($q, $http, $window, $base){
	return {
		get: function(url){
			// return '/' + url;
			return url;
		}
	}
}) 

.factory('$base', function($q, $http, $window){

	this.url = '';

	return {
		set: function(url){
		  this.url = url;
		},
		getUrl: function(){
		  return this.url;
		},

		query: function(q, url, method, onSuccess, onFailure){
		  onSuccess = onSuccess || function() {};
		  onFailure = onFailure || function() {};
		  var headers = {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}
		  var xsrf = _.isUndefined(q) ? '' : $.param(q);		  
		  console.log('-------- query ---------');
		  console.log(xsrf);
		  $http({method:method, data:xsrf, headers:headers, url:url})
		    .success(function(data){
		      onSuccess(q, data);
		    })
		    .error(function(data){
		      onFailure(q);
		    })
		},

		get: function(q, suffix){
		  var method = 'POST';
		  var that = this;
		  var deferred = $q.defer();
		  var url = this.url + '/list' + (_.isUndefined(suffix)?'':suffix);
		  console.log('get method url is ' + url);
		  console.log('suffix is ' + suffix);

		  that.query(q, url, method, function(q, data){
		    deferred.resolve(data);
		  }, function(q){
		  });

		  return deferred.promise;
		},

		view: function(q, suffix){
		  var method = 'GET';
		  var that = this;
		  var deferred = $q.defer();
		  var url = this.url + '/view' + (_.isUndefined(suffix)?'':suffix);

		  that.query(q, url, method, function(q, data){
		    deferred.resolve(data);
		  }, function(q){
		  });

		  return deferred.promise;
		},

		add: function(q,suffix){
		  var method = 'POST';
		  var that = this;
		  var deferred = $q.defer();
		  var url = this.url + '/add' + (_.isUndefined(suffix)?'':suffix);

		  that.query(q, url, method, function(q, data){
		    deferred.resolve(data);
		  }, function(q){
		  })
		  return deferred.promise;
		},

		edit: function(q,suffix){
		  var method = 'POST';
		  var that = this;
		  var deferred = $q.defer();
		  var url = this.url + '/edit' + (_.isUndefined(suffix)?'':suffix);

		  that.query(q, url, method, function(q, data){
		    deferred.resolve(data);
		  }, function(q){
		  })
		  return deferred.promise;
		},

		delete: function(q,suffix){
		  var method = 'POST';
		  var that = this;
		  var deferred = $q.defer();
		  var url = this.url + '/delete' + (_.isUndefined(suffix)?'':suffix);

		  that.query(q, url, method, function(q, data){
		    deferred.resolve(data);
		  }, function(q){
		  })
		  return deferred.promise;
		}
	} // end of return 
})

// .factory('TokenInterceptor', function ($q, $window, $location) {
//   return {
//     request: function (config) {
//       config.headers = config.headers || {};
//       return config;
//     },

//     response: function (response) {
//       return response || $q.when(response);
//     },
//     responseError: function(rejection){
//     	console.log('-------TokenInterceptor -------->>>>> ');
//     	console.log(rejection);
//     	console.log('-------TokenInterceptor -------->>>>> ');
//     	if(rejection.status == 401){
//     		console.log('-------TokenInterceptor status  ' + rejection.status);
//     		$window.document.location.href = '/login';
//     	}
//     }
//   };
// })

.factory('$sampleservice', function($q, $http, $window, $base, $burl){
	var obj = Object.create($base);
 	obj.set($burl.get('/data'));
	console.log('after creation $groupservice url is ' + obj.getUrl());

	obj.listMainMap = function(q, suffix){
		var method = 'GET';
		var that = this;
		var deferred = $q.defer();
		// console.log('ap_group suffix is ' + suffix);
		var url = $burl.get('/data') + '/jj01_'+suffix+'.json';
		// console.log('$baseService url is ' + url);

		that.query(q, url, method, function(q, data){
			console.log(that.keyPrefix + ' get success ');
			console.log(data);
			console.log('--------------------------');
			deferred.resolve(data);
		}, function(q){
			console.log(that.keyPrefix + ' get failure error q is ' + q);
		});

		return deferred.promise;
	};

	obj.listSchoolMap = function(q, suffix){
		var method = 'GET';
		var that = this;
		var deferred = $q.defer();
		// console.log('ap_group suffix is ' + suffix);
		var url = $burl.get('/data') + '/jj04_'+suffix+'.json';
		// console.log('$baseService url is ' + url);

		that.query(q, url, method, function(q, data){
			console.log(that.keyPrefix + ' get success ');
			console.log(data);
			console.log('--------------------------');
			deferred.resolve(data);
		}, function(q){
			console.log(that.keyPrefix + ' get failure error q is ' + q);
		});

		return deferred.promise;
	};

	obj.listGasungbiMap = function(q, suffix){
		var method = 'GET';
		var that = this;
		var deferred = $q.defer();
		// console.log('ap_group suffix is ' + suffix);
		var url = $burl.get('/data') + '/jj05_'+suffix+'.json';
		// console.log('$baseService url is ' + url);

		that.query(q, url, method, function(q, data){
			console.log(that.keyPrefix + ' get success ');
			console.log(data);
			console.log('--------------------------');
			deferred.resolve(data);
		}, function(q){
			console.log(that.keyPrefix + ' get failure error q is ' + q);
		});

		return deferred.promise;
	};

	return obj;
});

;angular.module('deitel.directives', [])

.factory('d3Service',['$document','$q','$rootScope',
  function($document, $q, $rootScope){
    var d = $q.defer();
    function onScriptLoad(){
      $rootScope.$apply(function() { d.resolve(window.d3); });
    }

    var scriptTag = $document[0].createElement('script');
    scriptTag.type = 'text/javascript';
    scriptTag.async = true;
    scriptTag.src = '/static/assets/vendor/d3.js';

    scriptTag.onreadystatechange = function() {
      if(this.readyState == 'complete') onScriptLoad();
    }
    scriptTag.onload = onScriptLoad;

    var s = $document[0].getElementsByTagName('body')[0];
    s.appendChild(scriptTag);

    return {
      d3: function() {return d.promise;}
    };
  }])

  .directive('googleMap', ['$window',function($window){
    return function(scope, iElement, iAttrs){
      var width = iElement[0].offsetWidth;
      angular.element(iElement).prepend('<style type="text/css"> .map-canvas, #map-canvas{width:100%;height:100%; border: 1px solid #333335;margin-bottom:20px;display: block;} </style>');
      angular.element(iElement).prepend('<div class=".map-canvas" id="map-canvas"></div>');
      var map,
          zoom = 10,
          center = new google.maps.LatLng(37.522423877485004, 127.0109950529785);
      var height = $window.innerHeight;
      iElement.height($(window).height());
      var options = {}
      // options = scope.$eval(iAttrs.googleMap);
      console.log(' --------- googleMap in mapboard directive ----------')
      console.log(scope.$eval(iAttrs.googleMap));
      if(iAttrs.googleMap.length > 0){
          options = scope.$eval(iAttrs.googleMap);
      }else{
        options = {
          zoom:zoom,
          center:center,
          scrollwheel:true,
          disableDefaultUI: true,
          mapTypeId: google.maps.MapTypeId.ROADMAP
        }
      }

      map = new google.maps.Map(iElement.find('div')[0], options);
      if(options.onLoad){
        options.onLoad(map);
      }
    } // end of return
  }]) // end of directive;
angular.module('deitel', ['ngRoute','ngSanitize','deitel.directives', 'deitel.services','deitel.controllers'])

.config(['$routeProvider', '$locationProvider','$httpProvider', function($routeProvider, $locationProvider,$httpProvider) {

	$routeProvider

		// .when('/', {
		// 	controller: 'OneCtrl' ,
		// 	templateUrl: '/views/one.html'
		// })
		.when('/', {
			controller: 'TwoCtrl' ,
			templateUrl: '/views/two.html'
		})

		.otherwise({
			redirectTo: '/'
		});
	$locationProvider.html5Mode(true);
	// $httpProvider.interceptors.push('TokenInterceptor');
}]);

