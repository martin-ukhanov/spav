import type { FocusableElement, SpavDirection } from './types';

/**
 * Determines if an element is a scroll container.
 *
 * @param element - The element to check.
 * @returns `true` if the element is a scroll container, `false` otherwise.
 */
export function isScrollContainer(element: Element) {
	const isOverflowX = element.scrollWidth > element.clientWidth;
	const isOverflowY = element.scrollHeight > element.clientHeight;

	if (element === document.documentElement) return isOverflowX || isOverflowY;
	if (!isOverflowX && !isOverflowY) return false;

	const SCROLL_VALUES = ['auto', 'scroll', 'hidden'];
	const style = getComputedStyle(element);

	const canScrollX = SCROLL_VALUES.includes(style.overflowX) && isOverflowX;
	const canScrollY = SCROLL_VALUES.includes(style.overflowY) && isOverflowY;

	return canScrollX || canScrollY;
}

/**
 * Determines if an element can be scrolled in a specific direction.
 *
 * @param element - The scroll container element to check.
 * @param direction - The direction to evaluate.
 * @returns `true` if scrolling is possible in the given direction, `false` otherwise.
 */
export function canScroll(element: Element, direction: SpavDirection) {
	const EPSILON = 1;
	const { scrollLeft, scrollTop, clientWidth, clientHeight, scrollWidth, scrollHeight } = element;

	switch (direction) {
		case 'left':
			return scrollLeft > EPSILON;
		case 'right':
			return scrollLeft + clientWidth < scrollWidth - EPSILON;
		case 'up':
			return scrollTop > EPSILON;
		case 'down':
			return scrollTop + clientHeight < scrollHeight - EPSILON;
	}
}

/**
 * Determines if an element is of a focusable type.
 *
 * @param element - The element to check.
 * @returns `true` if the element is a focusable type, `false` otherwise.
 */
export function isFocusableElement(element: Element): element is FocusableElement {
	return (
		element instanceof HTMLElement ||
		element instanceof SVGElement ||
		element instanceof MathMLElement
	);
}

/**
 * Determines whether an arrow key should escape an element to spatial navigation.
 * Non-editable elements always escape; editable ones escape only when the caret is
 * collapsed at the relevant edge.
 *
 * @param element - The element to inspect.
 * @param direction - The direction of navigation.
 * @returns `true` if navigation should proceed, `false` if the element keeps the key.
 */
export function isCaretAtEdge(element: Element, direction: SpavDirection) {
	if (
		!(element instanceof HTMLTextAreaElement) &&
		!(
			element instanceof HTMLInputElement &&
			['text', 'search', 'url', 'tel', 'password', 'email'].includes(element.type)
		)
	) {
		return true;
	}

	const atStart = direction === 'left' || direction === 'up';

	let selectionStart: number | null;
	let selectionEnd: number | null;

	try {
		selectionStart = element.selectionStart;
		selectionEnd = element.selectionEnd;
	} catch {
		return true;
	}

	if (selectionStart === null || selectionEnd === null) return true;
	if (selectionStart !== selectionEnd) return false;

	return atStart ? selectionStart === 0 : selectionEnd === element.value.length;
}

/**
 * Checks if a rectangle intersects the given bounds.
 *
 * @param rect - The rectangle to test.
 * @param bounds - The rectangle to test against.
 * @returns `true` if the rectangle intersects the bounds, `false` otherwise.
 */
export function intersects(rect: DOMRect, bounds: DOMRect) {
	return (
		rect.left < bounds.right &&
		rect.right > bounds.left &&
		rect.top < bounds.bottom &&
		rect.bottom > bounds.top
	);
}

/**
 * Computes the portion of a rectangle that lies within the given bounds.
 *
 * @param rect - The rectangle to clip.
 * @param bounds - The rectangle to clip against.
 * @returns The clipped rectangle, or `undefined` if the rectangle lies outside the bounds.
 */
export function getVisibleRect(rect: DOMRect, bounds: DOMRect) {
	const left = Math.max(bounds.left, rect.left);
	const right = Math.min(bounds.right, rect.right);
	const top = Math.max(bounds.top, rect.top);
	const bottom = Math.min(bounds.bottom, rect.bottom);

	if (right - left <= 0 || bottom - top <= 0) return undefined;

	return new DOMRect(left, top, right - left, bottom - top);
}

/**
 * Checks if a target rectangle is located in a specific direction relative to an origin rectangle.
 *
 * @param originRect - The bounding rectangle of the origin element.
 * @param targetRect - The bounding rectangle of the target element.
 * @param direction - The direction to evaluate.
 * @returns `true` if the target is in the specified direction relative to the origin, `false` otherwise.
 */
export function isInDirection(originRect: DOMRect, targetRect: DOMRect, direction: SpavDirection) {
	switch (direction) {
		case 'left':
			return (
				originRect.left >= targetRect.right ||
				(originRect.left >= targetRect.left &&
					originRect.right > targetRect.right &&
					originRect.bottom > targetRect.top &&
					originRect.top < targetRect.bottom)
			);

		case 'right':
			return (
				targetRect.left >= originRect.right ||
				(targetRect.left >= originRect.left &&
					targetRect.right > originRect.right &&
					targetRect.bottom > originRect.top &&
					targetRect.top < originRect.bottom)
			);

		case 'up':
			return (
				originRect.top >= targetRect.bottom ||
				(originRect.top >= targetRect.top &&
					originRect.bottom > targetRect.bottom &&
					originRect.left < targetRect.right &&
					originRect.right > targetRect.left)
			);

		case 'down':
			return (
				targetRect.top >= originRect.bottom ||
				(targetRect.top >= originRect.top &&
					targetRect.bottom > originRect.bottom &&
					targetRect.left < originRect.right &&
					targetRect.right > originRect.left)
			);
	}
}

/**
 * Calculates the physical edge-to-edge distance between two rectangles in a given direction.
 *
 * @param originRect - The bounding rectangle of the origin.
 * @param targetRect - The bounding rectangle of the target.
 * @param direction - The direction to measure.
 * @returns The calculated edge distance in pixels.
 */
export function getEdgeDistance(
	originRect: DOMRect,
	targetRect: DOMRect,
	direction: SpavDirection
) {
	switch (direction) {
		case 'left':
			return Math.abs(originRect.right - targetRect.right);
		case 'right':
			return Math.abs(originRect.left - targetRect.left);
		case 'up':
			return Math.abs(originRect.bottom - targetRect.bottom);
		case 'down':
			return Math.abs(originRect.top - targetRect.top);
	}
}

/**
 * Calculates a weighted heuristic distance between two rectangles.
 *
 * @param originRect - The bounding rectangle of the origin.
 * @param targetRect - The bounding rectangle of the target.
 * @param direction - The direction to evaluate.
 * @returns A weighted distance value.
 */
export function getWeightedDistance(
	originRect: DOMRect,
	targetRect: DOMRect,
	direction: SpavDirection
) {
	const fromWidth = Math.max(originRect.width, 1);
	const fromHeight = Math.max(originRect.height, 1);

	const gapX = Math.max(0, originRect.left - targetRect.right, targetRect.left - originRect.right);
	const gapY = Math.max(0, originRect.top - targetRect.bottom, targetRect.top - originRect.bottom);

	const euclideanDistance = Math.hypot(gapX, gapY);

	const overlapX = Math.max(
		0,
		Math.min(originRect.right, targetRect.right) - Math.max(originRect.left, targetRect.left)
	);

	const overlapY = Math.max(
		0,
		Math.min(originRect.bottom, targetRect.bottom) - Math.max(originRect.top, targetRect.top)
	);

	const overlapArea = overlapX * overlapY;

	let orthogonalDistance: number;
	let orthogonalBias: number;
	let orthogonalWeight: number;
	let alignBias: number;

	if (direction === 'left' || direction === 'right') {
		orthogonalDistance = gapY;
		orthogonalBias = fromHeight / 2;
		orthogonalWeight = 30;
		alignBias = overlapY / fromHeight;
	} else {
		orthogonalDistance = gapX;
		orthogonalBias = fromWidth / 2;
		orthogonalWeight = 2;
		alignBias = overlapX / fromWidth;
	}

	const displacement = (orthogonalDistance + orthogonalBias) * orthogonalWeight;

	const ALIGN_WEIGHT = 5;
	const alignment = alignBias * ALIGN_WEIGHT;

	return euclideanDistance + displacement - alignment - Math.sqrt(overlapArea);
}
