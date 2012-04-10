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

	// Constructor
	function HPanelWeb( container, selector, options ) {
		this.container = container;
		this.$container = $( container ).addClass( 'hpanelweb-container' );
		this.$container.data( 'x-hpanelweb', this );
		this.$columns = this.$container.find( selector ).addClass( 'hpanelweb-column' );
		this.options = options || {};
		this.options.padding = 32; // @fixme
		this.options.prevOverlap = 100;
		this.activeColumn = 0;
		setup.call( this );
	}

	// Setup code
	function setup() {
		this.$columns.data( 'x-hpanelweb-parent', this.container );
		this.$plane = $( '<div class="hpanelweb-plane" />' );
		this.plane = this.$plane[0]; 
		this.$columns.appendTo( this.$plane );
		this.$container.empty().append( this.$plane );
		this.$container.css( {
			display: 'block',
			position: 'relative',
			overflow: 'hidden',
			height: $( window ).height() // @todo Configurable
		} );
		this.$plane.css( {
			position: 'absolute',
			top: 0,
			left: 0
		} );
		this.$columns.css( {
			position: 'absolute',
			top: 0,
			overflow: 'auto'
		} );
		// Setup events
		setupEvents.call( this );
		// Calculate the setup
		this.recalculateSizes();
		this.recalculatePositions();
	}

	// @todo Do we need to add some code that restricts to only one type of event?
	function onwheel( event, type ) {
		var origEvent = event || window.event;
		var e = $.event.fix( origEvent );
		e.type = type;

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

		delta.angle = Math.atan2( delta.y, delta.x ) * ( 180 / Math.PI );
		while ( delta.angle < 0 ) delta.angle += 360;
		delta.angle = delta.angle % 360;

		delta.horizontal = delta.angle < 45
			|| delta.angle > ( 90 * 3.5 )
			|| ( delta.angle > ( 90 * 1.5 ) && delta.angle < ( 90 * 2.5 ) );

		var container = $( e.target );
		container = container.is( '.hpanelweb-container' ) ? container : container.closest( '.hpanelweb-container' );
		var hpanelweb = container.data( 'x-hpanelweb' );
		if ( !hpanelweb ) {
			return;
		}
 		var targets = $( e.target )
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

		hpanelweb.$plane.css( 'left', parseFloat( hpanelweb.$plane.css( 'left' ) ) + delta.x );
		if ( afterScrollTimeout ) {
			afterScrollTimeout = clearTimeout( afterScrollTimeout );
		}
		afterScrollTimeout = setTimeout( function() { afterScroll.call( hpanelweb ); }, 300 );
		e.preventDefault();
		e.stopPropagation();
	}

	var afterScrollTimeout;
	function afterScroll() {
		this.activateColumn( this.$columns.filter( ':activehcolumn:first' ) );
	}

	function onclick( e ) {
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
		hpanelweb.recalculatePositions();
	}

	function setupEvents() {
		var container = this.container, hpanelweb = this;;
		if ( container.addEventListener ) {
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

	// Window resize handling
	$( window ).resize( function() {
		$( '.hpanelweb-container' ).each( function() {
			var hpanelweb = $( this ).data( 'x-hpanelweb' );
			if ( !hpanelweb ) {
				return;
			}
			hpanelweb.recalculateSizes();
			hpanelweb.recalculatePositions();
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

	// Method to recalculate container and column sizes when something about the
	// page changes.
	HPanelWeb.prototype.recalculateSizes = function() {
		var $container = this.$container;
		$container.css( 'height', $( window ).height() ); // @todo This could be something else
		this.$plane.height( $container.height() ); 
		// Reset the width to auto calculate it
		$container.css( 'width', '' );
		// Then re-fix the width
		$container.width( $container.width() );
		var maxHeight = $container.height();
		this.$plane.css( 'minWidth',  $container.width() );
		this.$columns.each( function() {
			// Force the current width to avoid overlap issues and some cases
			// where the browser tries to shrink the content too much
			var width;
			safeCalc( this, function() {
				width = $( this ).width();
			} );
			$( this ).width( width );
			//$( this ).width( $( this ).width() );
			// Also fix the maximum size as the container's size to avoid issues there
			$( this ).css( 'maxHeight', maxHeight );
		} );
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
		var $columns = this.$columns, options = this.options;
		var sizes = this.getSizes();
		var positions = new Array( sizes.length );

		var nextpos = 0;
		$.each( sizes, function( i, width ) {
			var $$ = $( $columns[sizes[i]] );
			positions[i] = nextpos;
			nextpos += options.padding + width;
		} );
		
		// Tweak for active column, plane, and prev element overlap
		var planeOffset = this.$plane.position().left;
		var activePosition = positions[this.activeColumn];
		$.each( positions, function( i ) {
			positions[i] -= activePosition + planeOffset - options.prevOverlap ;
		} );

		$columns.each( function( i ) {
			var $$ = $( this );
			$$.css( 'left', positions[i] );
			// @fixme This part is just for dev
			$$.css( 'opacity', $$.is( ':activehcolumn' ) ? 1 : .35 );
		} );
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
		// $.extend options and defaults
		// merge selector with options
		this.each( function() {
			var hpanelweb = new HPanelWeb( this, selector, options );
		} );

		return this;
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
		var right = left + $column.outerWidth();
		return left >= 0 && right <= containerWidth;
	};

} )( jQuery );
