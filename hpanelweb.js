/*!
 * Copyright © 2012 Redwerks Systems Inc. (http://redwerks.org)
 * @author Daniel Friesen
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */
( function( $, undefined ) {

	/**
	 * Important parts of usability:
	 * - Horizontal scroll wheel/trackpad should work to navigate
	 *   - However these should be ignored if hovering over a horizontally scrollable element
	 * - Left right arrows should work to navigate (must not be allowed to scroll the rest of the page when active)
	 * - The focus event should be listened for. If a link or input becomes focused make sure to bring it into view.
	 * - Finger swipe gestures should work to navigate
	 * - Finger scroll gestures may want to work like horizontal scrolling
	 * - Single finger should be usable to navigate, however we may want to ensure not getting in the way of some system actions
	 * - When navigating via some form of user controlled scrolling after the user has stopped we should snap back to a standard location
	 */

	 // @fixme If something like a #anchor click tricks the container into moving to a different scroll position
	 //        natively the calculations will be broken. We'll need to take this into account. Perhaps by testing for an offset,
	 //        setting it back to 0 and recalculating (no animation) the location of columns


	var styleInitialized = false;
	function initStyle() {
		if ( styleInitialized ) {
			return;
		}

		$( [
			'<style id="hpanelweb-style">',
			".hpanelweb-container {",
			"	display: block;",
			"	position: relative;",
			"	overflow: hidden;",
			"	-webkit-overflow-scrolling: touch;",
			"}",
			".hpanelweb-plane {",
			"	position: absolute;",
			"	top: 0;",
			"	left: 0;",
			"}",
			".hpanelweb-column {",
			"	position: absolute;",
			"	top: 0;",
			"	overflow: auto;",
			"	-webkit-overflow-scrolling: touch;",
			"}",
			".hpanelweb-column.hpanelweb-inactive {",
			"	opacity: .35;",
			"}",
			".hpanelweb-paneindicator {",
			"	position: absolute;",
			"	top: 0;",
			"	bottom: 0;",
			"	width: 35px;",
			"	z-index: 1;",
			"	opacity: 0.35;",
			"	background-color: #333;",
			"	pointer-events: none;",
			"}",
			".hpanelweb-paneindicator.hpanelweb-inactive {",
			"	display: none;",
			"}",
			".hpanelweb-paneindicator-left {",
			"	left: 0;",
			"}",
			".hpanelweb-paneindicator-right {",
			"	right: 0;",
			"}",
			'</style>'
		].join( '\n' ) ).appendTo( 'head' );

		styleInitialized = true;
	}

	// Constructor
	function HPanelWeb( container, selector, options ) {
		this.container = container;
		this.$container = $( container ).addClass( 'hpanelweb-container' );
		this.$container.data( 'x-hpanelweb', this );
		this.$columns = this.$container.find( selector ).addClass( 'hpanelweb-column' );
		this.options = $.extend( {
			padding: 32,
			leftOverlap: false
		}, options );
		this.activeColumn = 0;
		setup.call( this );
	}

	// Setup code
	function setup() {
		initStyle();
		this.$columns.data( 'x-hpanelweb-parent', this.container );
		this.$plane = $( '<div class="hpanelweb-plane" />' );
		this.$leftPaneIndicator = $( '<div class="hpanelweb-paneindicator hpanelweb-paneindicator-left" />' );
		this.$rightPaneIndicator = $( '<div class="hpanelweb-paneindicator hpanelweb-paneindicator-right" />' );
		this.plane = this.$plane[0];
		this.$columns.appendTo( this.$plane );
		this.$container.empty()
			.append( this.$leftPaneIndicator, this.$rightPaneIndicator )
			.append( this.$plane );
		// Prevent tap highlighting of the panel itself
		this.$plane.css( '-webkit-tap-highlight-color', this.$container.css( '-webkit-tap-highlight-color' ) );
		this.$container.css( '-webkit-tap-highlight-color', 'transparent' );
		// Setup events
		setupEvents.call( this );
		// Calculate the setup
		this.recalculateSizes();
		this.recalculatePositions();
	}

	function onlyevent( type ) {
		if ( !onlyevent.type || onlyevent.type === type ) {
			onlyevent.type = type;
			return true;
		}
		if ( onlyevent.preference.indexOf( type ) > onlyevent.preference.indexOf( onlyevent.type ) ) {
			onlyevent.type = type;
			return true;
		}
		return false;
	}
	onlyevent.preference = [ 'mousewheel', 'DOMMouseScroll', 'wheel', 'touch' ];

	function handleDelta( t, delta ) {
		delta.angle = Math.atan2( delta.y, delta.x ) * ( 180 / Math.PI );
		while ( delta.angle < 0 ) delta.angle += 360;
		delta.angle = delta.angle % 360;

		delta.horizontal = delta.angle < 45
			|| delta.angle > ( 90 * 3.5 )
			|| ( delta.angle > ( 90 * 1.5 ) && delta.angle < ( 90 * 2.5 ) );

		var container = $( t );
		container = container.is( '.hpanelweb-container' ) ? container : container.closest( '.hpanelweb-container' );
		var hpanelweb = container.data( 'x-hpanelweb' );
		if ( !hpanelweb ) {
			return;
		}
 		var targets = $( t )
 			.not( '.hpanelweb-container, .hpanelweb-plane' )
 			.parentsUntil( '.hpanelweb-container, .hpanelweb-plane' ).toArray();
		while( targets.length ) {
			var target = targets.shift();
			var inScrollable = ( delta.horizontal && target.scrollWidth > target.offsetWidth )
			|| ( !delta.horizontal && target.scrollHeight > target.offsetHeight );
			if ( inScrollable ) {
				// If we're inside an element with it's own ability to scroll in
				// the direction the user is trying to scroll skip our handling
				return;
			}
		}

		hpanelweb.$plane.css( 'left', parseFloat( hpanelweb.$plane.css( 'left' ) ) - delta.x );
		return hpanelweb;
	}

	var ontouch = {
		start: function( e ) {
			if ( !onlyevent('touch') ) return;
			var touches = e.targetTouches || e.touches;
			if ( touches.length > 1 ) {
				// Only work on single finger movements
				return;
			}
			ontouch.touch = { target: e.target, pageX: touches[0].pageX, pageY: touches[0].pageY };
		},
		move: function( e ) {
			if ( !ontouch.touch ) {
				return;
			}
			var touches = e.targetTouches || e.touches;
			if ( touches.length > 1 ) {
				// Only work on single finger movements
				return;
			}
			var thistouch = { target: ontouch.touch.target, pageX: touches[0].pageX, pageY: touches[0].pageY };
			var delta = {
				x: ontouch.touch.pageX - thistouch.pageX,
				y: ontouch.touch.pageY - thistouch.pageY
			};
			
			var hpanelweb = handleDelta( e.target, delta );
			if ( hpanelweb ) {
				e.preventDefault();
				e.stopPropagation();
			}

			ontouch.touch = thistouch;
		},
		end: function( e ) {
			var hpanelweb = $( e.target ).hpanelweb( 'get' );
			if ( hpanelweb ) {
				hpanelweb.readyDelayedActivation();
			}
			delete ontouch.touch;
		}
	}

	// @todo Do we need to add some code that restricts to only one type of event?
	function onwheel( event, type ) {
		var origEvent = event || window.event;
		var e = $.event.fix( origEvent );
		e.type = type;
		if ( !onlyevent(type) ) return;

		var delta = { x: 0, y: 0 };

		var linesScaleFactor = 25;
		var deltaScaleFactor = 3;
		if ( $.browser.MSIE
			|| ( $.browser.webkit &&
				( /^Win/.test( navigator.platform ) || parseFloat( $.browser.version ) > 532 ) ) ) {
			// In IE wheelDelta is a multiple of 120,
			// same for newer versions of Webkit and WebKit on Windows.
			deltaScaleFactor = 120;
		}

		// DOM Level 3 WheelEvent (IE9)
		if ( origEvent.deltaX !== undefined || origEvent.deltaY !== undefined ) {
			// @note deltaMode can be 0x00 = Pixel, 0x01 = Line, 0x02 = Page
			// we don't really know what values we should use for Line or Page
			// so for now we'll just treat them like pixels
			delta.y = origEvent.deltaY;
			delta.x = origEvent.deltaX;
		}
		// Double axis WebKit deltas
		else if ( origEvent.wheelDeltaY !== undefined || origEvent.wheelDeltaX !== undefined ) {
			delta.y = origEvent.wheelDeltaY / deltaScaleFactor * linesScaleFactor;
			delta.x = -1 * origEvent.wheelDeltaX / deltaScaleFactor * linesScaleFactor;
		}
		// Gecko
		else if ( origEvent.detail ) {
			var detail = Math.min( 3, Math.max( -3, origEvent.detail ) );
			// Gecko's horizontal axis
			if ( origEvent.axis !== undefined && origEvent.axis === origEvent.HORIZONTAL_AXIS ) {
				delta.x = detail / 3 * linesScaleFactor;
			} else {
				delta.y = -detail / 3 * linesScaleFactor;
			}
		}
		// IE and old browsers
		else if ( origEvent.wheelDelta ) {
			delta.y = origEvent.wheelDelta / deltaScaleFactor * linesScaleFactor;
		}

		var hpanelweb = handleDelta( e.target, delta );
		if ( hpanelweb ) {
			hpanelweb.readyDelayedActivation();
			e.preventDefault();
			e.stopPropagation();
		}
	}

	function onclick( event ) {
		var origEvent = event || window.event;
		var e = $.event.fix( origEvent );
		var $container = $( e.target ).closest( '.hpanelweb-container' );
		if ( !$container.length ) {
			return;
		}
		var hpanelweb = $container.data( 'x-hpanelweb' );
		if ( !hpanelweb ) {
			return;
		}
		var $column = $( e.target ).closest( '.hpanelweb-column', hpanelweb.container );
		if ( !$column.length ) {
			return;
		}
		if ( $column.is( ':activehcolumn' ) ) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();
		// Activate the column and bring it into view
		hpanelweb.activateColumn( $column );
	}

	function setupEvents() {
		var container = this.container, hpanelweb = this;;
		if ( container.addEventListener ) {
			container.addEventListener( 'touchstart', ontouch.start );
			container.addEventListener( 'touchmove', ontouch.move );
			container.addEventListener( 'touchend', ontouch.end );
			container.addEventListener( 'wheel', function( e ) { return onwheel.call( this, e, 'wheel' ); }, false );
			container.addEventListener( 'DOMMouseScroll', function( e ) { return onwheel.call( this, e, 'DOMMouseScroll' ); }, false );
			container.addEventListener( 'mousewheel', function( e ) { return onwheel.call( this, e, 'mousewheel' ); }, false );
			container.addEventListener( 'click', onclick, true );
		} else if ( container.attachEvent ) {
			container.attachEvent( 'onmousewheel', onwheel );
			container.attachEvent( 'onclick', onclick );
		}
		this.$container.delegate( 'a', 'focus', function( e ) {
			var column = $( this ).closest( '.hpanelweb-column' );
			if ( column.is( ':not(:activehcolumn)' ) ) {
				hpanelweb.activateColumn( column );
			}
		} );
	}

	// Window resize, ready, and load handling
	// We recalc on load in addition to ready in case a freshly loaded image has changed the area dimensions
	function fullRecalculate() {
		$( '.hpanelweb-container' ).each( function() {
			var hpanelweb = $( this ).data( 'x-hpanelweb' );
			if ( !hpanelweb ) {
				return;
			}
			hpanelweb.recalculateSizes();
			hpanelweb.recalculatePositions();
		} );
	}
	$( window ).resize( fullRecalculate );
	$( document ).ready( fullRecalculate );
	$( document ).load( fullRecalculate );

	// Fragment link click handling
	$( document ).delegate( 'a[href]', 'click', function( e ) {
		var href = $( this ).attr( 'href' );
		var m = href.match( /^#(.+)$/ );
		if ( !m ) {
			return;
		}
		var node = document.getElementById( m[1] );
		if ( !node ) {
			return;
		}

		var $column = $( node ).hpanelweb( 'get-column' );
		var hpanelweb = $column.data( 'x-hpanelweb-parent' )
		hpanelweb = $( hpanelweb ).data( 'x-hpanelweb' );
		if ( !$column.length || !hpanelweb ) {
			return;
		}
		hpanelweb.activateColumn( $column );
		return false;
	} );

	// Left/Right arrow key handling
	var KEY = { LEFT: 37, RIGHT: 39 }
	$( window ).keyup( function( e ) {
		if ( e.which !== KEY.LEFT && e.which !== KEY.RIGHT ) {
			return;
		}
		var viewport = {
			top: $( window ).scrollTop(),
			left: $( window ).scrollLeft()
		};
		viewport.width = $( window ).width();
		viewport.height = $( window ).height();
		viewport.right = viewport.left + viewport.width;
		viewport.bottom = viewport.top + viewport.height;
		$( '.hpanelweb-container' ).each( function() {
			var container = $( this ).offset();
			container.width = $( this ).outerWidth();
			container.height = $( this ).outerHeight();
			container.right = container.left + container.width;
			container.bottom = container.top + container.height;

			var intersect = {
				top: Math.max( viewport.top, container.top ),
				bottom: Math.min( viewport.bottom, container.bottom ),
				left: Math.max( viewport.left, container.left ),
				right: Math.min( viewport.right, container.right )
			};
			intersect.width = Math.max( 0, intersect.right - intersect.left );
			intersect.height = Math.max( 0, intersect.bottom - intersect.top );

			if ( intersect.width / container.width > 0.75
				&& intersect.height / container.height > 0.75 )
			{
				// If the container is at least 75% in view trigger navigation on it
				var hpanelweb = $( this ).data( 'x-hpanelweb' );
				if ( !hpanelweb ) {
					return;
				}
				var activeColumn = hpanelweb.activeColumn;
				activeColumn += ( e.which == KEY.LEFT ? -1 : +1 );
				activeColumn = (activeColumn + hpanelweb.$columns.length) % hpanelweb.$columns.length;
				hpanelweb.activateColumn( activeColumn );
			}
		} );
	} );

	function safeCalc( elem, callback ) {
		// This function temporarily strips out local sizes and positions to allow us to calculate the automatic ones
		// To avoid triggering transitions it also temporarily disables them
		var oldStyle = {};
		$.each( [ 'width', 'height', 'left' ], function( i, prop ) {
			oldStyle[prop] = elem.style[prop];
			elem.style[prop] = '';
		} );
		// Run the callback
		callback.call( elem );
		// Reset the styles
		for ( var prop in oldStyle ) {
			elem.style[prop] = oldStyle[prop];
		}
	}

	HPanelWeb.prototype.recalculateHeight = function() {
		var $c = this.$container;
		var height = $( window ).height();
		$( this.options.visibleSiblings || [] ).each( function() {
			height -= $( this ).outerHeight();
		} );
		$c.css( 'height', height );
		this.$plane.height( $c.height() ); 
	};

	// Method to recalculate container and column sizes when something about the
	// page changes.
	HPanelWeb.prototype.recalculateSizes = function() {
		var $c = this.$container;
		this.recalculateHeight();
		// Reset the width to auto calculate it
		$c.css( 'width', '' );
		// Then re-fix the width
		var containerWidth = Math.min( $c.width(), $( window ).width() );
		$c.width( containerWidth );
		var height = Math.min( $c.height(), $( window ).height() );
		$c.css( 'height', '' );
		this.$plane.css( 'minWidth',  $c.width() );
		this.$columns.each( function() {
			// Force the current width to avoid overlap issues and some cases
			// where the browser tries to shrink the content too much
			var width;
			safeCalc( this, function() {
				width = $( this ).width();
			} );
			$( this ).width( Math.min( width, containerWidth ) );
			//$( this ).width( $( this ).width() );
			// Also fix the maximum size as the container's size to avoid issues there
			$( this ).css( 'height', height );
		} );
		$c.height( height );
	};

	// Method to return the current widths of the columns
	HPanelWeb.prototype.getSizes = function() {
		return this.$columns.map( function() {
			return $( this ).width();
		} );
	};

	// Method to recalculate the positions of elements whenever something on the
	// page changes or the user makes a navigation action
	HPanelWeb.prototype.recalculatePositions = function( animate ) {
		var hpanelweb = this, $columns = this.$columns, options = this.options;
		var sizes = this.getSizes();
		var positions = new Array( sizes.length );

		var nextpos = 0;
		$.each( sizes, function( i, width ) {
			var $$ = $( $columns[sizes[i]] );
			positions[i] = nextpos;
			nextpos += options.padding + width;
		} );

		var containerWidth = this.$container.width();
		var activeWidth = 0;
		var a;
		for ( a = this.activeColumn; a < sizes.length; a++ ) {
			if ( activeWidth + options.padding + sizes[a] >= containerWidth && activeWidth > 0 ) {
				break;
			}
			activeWidth += options.padding + sizes[a];
		}
		activeWidth -= options.padding;

		var edgeOverlap = typeof options.leftOverlap === 'number'
			? options.leftOverlap
			: Math.floor( ( containerWidth - activeWidth ) / 2 );

		// Tweak for active column, plane, and prev element overlap
		var planeOffset = this.$plane.position().left;
		var activePosition = positions[this.activeColumn];
		$.each( positions, function( i ) {
			positions[i] -= activePosition + planeOffset - edgeOverlap;
		} );

		$columns.each( function( i ) {
			var $$ = $( this );
			var props = { left: positions[i] };
			if ( animate ) {
				$$.animate( props, { complete: function() { hpanelweb.refreshStyles( animate, $$ ); } } );
			} else {
				$$.css( props );
			}
			hpanelweb.refreshStyles( animate, $$ );
		} );
	};

	HPanelWeb.prototype.refreshStyles = function( animate, $column ) {
		this.$leftPaneIndicator.toggleClass( 'hpanelweb-inactive', this.$columns.first().is( ':activehcolumn' ) );
		this.$rightPaneIndicator.toggleClass( 'hpanelweb-inactive', this.$columns.last().is( ':activehcolumn' ) );
		( $column || this.$columns ).each( function() {
			var $$ = $( this );
			$$.toggleClass( 'hpanelweb-inactive', !$$.is( ':activehcolumn' ) );
		} );
	};

	HPanelWeb.prototype.activateVisibleColumns = function() {
		this.activateColumn( this.$columns.filter( ':activehcolumn:first' ) );
	}
	HPanelWeb.prototype.readyDelayedActivation = function() {
		var hpanelweb = this;
		if ( HPanelWeb.prototype.delayedActivationTimeout ) {
			HPanelWeb.prototype.delayedActivationTimeout = clearTimeout( HPanelWeb.prototype.delayedActivationTimeout );
		}
		HPanelWeb.prototype.delayedActivationTimeout = setTimeout( function() { hpanelweb.activateVisibleColumns(); }, 300 );
	};

	HPanelWeb.prototype.activateColumn = function( column ) {
		if ( typeof column !== 'number' ) {
			var column = $( column ).closest( '.hpanelweb-column', this.container )[0];
			column = Math.max( 0, $.inArray( column, this.$columns ) );
		}
		this.activeColumn = column;
		this.recalculatePositions( true );
	};

	// Bind the library to jQuery
	$.fn.hpanelweb = function( selector, options ) {
		if ( selector === 'get' ) {
			var hpanelweb = this.data( 'x-hpanelweb' );
			if ( hpanelweb ) {
				return hpanelweb;
			}
			return this.closest( '.hpanelweb-container' ).data( 'x-hpanelweb' );
		} else if ( selector === 'get-column' ) {
			if ( this.is( '.hpanelweb-column' ) ) {
				return this;
			} else {
				return this.closest( '.hpanelweb-column' );
			}
		} else {
			// $.extend options and defaults
			// merge selector with options
			return this.each( function() {
				var hpanelweb = new HPanelWeb( this, selector, options );
			} );
		}
	};

	// Extend jQuery's selectors
	jQuery.expr.filters['activehcolumn'] = function( elem ) {
		var $column = $( elem );
		var parent = $column.data( 'x-hpanelweb-parent' );
		if ( !parent ) {
			return false;
		}
		var hpanelweb = $( parent ).data( 'x-hpanelweb' );
		if ( !hpanelweb ) {
			return false;
		}
		var $container = $( parent );
		var containerWidth = $container.width();
		var left = hpanelweb.$plane.position().left + $column.position().left;
		var right = left + $column.width();
		return left >= 0 && right <= containerWidth;
	};

} )( jQuery );
