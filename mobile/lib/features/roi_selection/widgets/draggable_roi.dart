import 'dart:math' as math;
import 'dart:ui' show ClipOp, Rect;

import 'package:flutter/material.dart';

/// The radius (in logical pixels) of the corner drag handles.
const double _kHandleRadius = 10.0;

/// The touch area around each handle for easier grabbing.
const double _kHandleTouchRadius = 24.0;

/// Which part of the ROI rectangle the user is dragging.
enum _DragTarget {
  body,
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  top,
  bottom,
  left,
  right,
}

/// An overlay widget that renders a draggable / resizable Region of Interest
/// rectangle on top of an image.
///
/// Coordinates in [roi] are in *image* space. The widget handles conversion
/// to/from display coordinates using [imageSize] and [displaySize].
class DraggableRoi extends StatefulWidget {
  /// Current ROI rectangle in image coordinates.
  final Rect roi;

  /// The full size of the source image (pixels).
  final Size imageSize;

  /// The size at which the image is displayed on screen (logical pixels).
  final Size displaySize;

  /// Called whenever the user moves or resizes the ROI.
  /// The returned [Rect] is in image coordinates.
  final ValueChanged<Rect> onChanged;

  const DraggableRoi({
    super.key,
    required this.roi,
    required this.imageSize,
    required this.displaySize,
    required this.onChanged,
  });

  @override
  State<DraggableRoi> createState() => _DraggableRoiState();
}

class _DraggableRoiState extends State<DraggableRoi> {
  _DragTarget? _activeDrag;
  Offset _dragStart = Offset.zero;
  late Rect _roiAtDragStart;

  // ── Coordinate helpers ──────────────────────────────────────────────────

  double get _scaleX => widget.displaySize.width / widget.imageSize.width;
  double get _scaleY => widget.displaySize.height / widget.imageSize.height;

  /// Convert an image-space rect to display-space.
  Rect _toDisplay(Rect r) {
    return Rect.fromLTRB(
      r.left * _scaleX,
      r.top * _scaleY,
      r.right * _scaleX,
      r.bottom * _scaleY,
    );
  }

  /// Convert a display-space rect to image-space, clamped to the image bounds.
  Rect _toImage(Rect r) {
    return Rect.fromLTRB(
      (r.left / _scaleX).clamp(0, widget.imageSize.width),
      (r.top / _scaleY).clamp(0, widget.imageSize.height),
      (r.right / _scaleX).clamp(0, widget.imageSize.width),
      (r.bottom / _scaleY).clamp(0, widget.imageSize.height),
    );
  }

  // ── Drag handling ───────────────────────────────────────────────────────

  _DragTarget _hitTest(Offset pos) {
    final displayRoi = _toDisplay(widget.roi);

    // Check corners first.
    if (_nearPoint(pos, displayRoi.topLeft)) return _DragTarget.topLeft;
    if (_nearPoint(pos, displayRoi.topRight)) return _DragTarget.topRight;
    if (_nearPoint(pos, displayRoi.bottomLeft)) return _DragTarget.bottomLeft;
    if (_nearPoint(pos, displayRoi.bottomRight)) return _DragTarget.bottomRight;

    // Check edges.
    if (_nearHorizontalEdge(pos, displayRoi.top, displayRoi.left,
        displayRoi.right)) {
      return _DragTarget.top;
    }
    if (_nearHorizontalEdge(pos, displayRoi.bottom, displayRoi.left,
        displayRoi.right)) {
      return _DragTarget.bottom;
    }
    if (_nearVerticalEdge(pos, displayRoi.left, displayRoi.top,
        displayRoi.bottom)) {
      return _DragTarget.left;
    }
    if (_nearVerticalEdge(pos, displayRoi.right, displayRoi.top,
        displayRoi.bottom)) {
      return _DragTarget.right;
    }

    // Inside the rect: move.
    if (displayRoi.contains(pos)) return _DragTarget.body;

    return _DragTarget.body;
  }

  bool _nearPoint(Offset a, Offset b) {
    return (a - b).distance <= _kHandleTouchRadius;
  }

  bool _nearHorizontalEdge(Offset pos, double y, double x0, double x1) {
    return (pos.dy - y).abs() <= _kHandleTouchRadius &&
        pos.dx >= x0 - _kHandleTouchRadius &&
        pos.dx <= x1 + _kHandleTouchRadius;
  }

  bool _nearVerticalEdge(Offset pos, double x, double y0, double y1) {
    return (pos.dx - x).abs() <= _kHandleTouchRadius &&
        pos.dy >= y0 - _kHandleTouchRadius &&
        pos.dy <= y1 + _kHandleTouchRadius;
  }

  void _onPanStart(DragStartDetails details) {
    _activeDrag = _hitTest(details.localPosition);
    _dragStart = details.localPosition;
    _roiAtDragStart = _toDisplay(widget.roi);
  }

  void _onPanUpdate(DragUpdateDetails details) {
    if (_activeDrag == null) return;

    final delta = details.localPosition - _dragStart;
    final minSize = 20.0; // minimum display-space size

    Rect newDisplayRoi;

    switch (_activeDrag!) {
      case _DragTarget.body:
        newDisplayRoi = _roiAtDragStart.shift(delta);
        // Clamp to display bounds.
        double dx = 0, dy = 0;
        if (newDisplayRoi.left < 0) dx = -newDisplayRoi.left;
        if (newDisplayRoi.top < 0) dy = -newDisplayRoi.top;
        if (newDisplayRoi.right > widget.displaySize.width) {
          dx = widget.displaySize.width - newDisplayRoi.right;
        }
        if (newDisplayRoi.bottom > widget.displaySize.height) {
          dy = widget.displaySize.height - newDisplayRoi.bottom;
        }
        newDisplayRoi = newDisplayRoi.shift(Offset(dx, dy));
        break;

      case _DragTarget.topLeft:
        newDisplayRoi = Rect.fromLTRB(
          math.min(_roiAtDragStart.left + delta.dx,
              _roiAtDragStart.right - minSize),
          math.min(_roiAtDragStart.top + delta.dy,
              _roiAtDragStart.bottom - minSize),
          _roiAtDragStart.right,
          _roiAtDragStart.bottom,
        );
        break;

      case _DragTarget.topRight:
        newDisplayRoi = Rect.fromLTRB(
          _roiAtDragStart.left,
          math.min(_roiAtDragStart.top + delta.dy,
              _roiAtDragStart.bottom - minSize),
          math.max(_roiAtDragStart.right + delta.dx,
              _roiAtDragStart.left + minSize),
          _roiAtDragStart.bottom,
        );
        break;

      case _DragTarget.bottomLeft:
        newDisplayRoi = Rect.fromLTRB(
          math.min(_roiAtDragStart.left + delta.dx,
              _roiAtDragStart.right - minSize),
          _roiAtDragStart.top,
          _roiAtDragStart.right,
          math.max(_roiAtDragStart.bottom + delta.dy,
              _roiAtDragStart.top + minSize),
        );
        break;

      case _DragTarget.bottomRight:
        newDisplayRoi = Rect.fromLTRB(
          _roiAtDragStart.left,
          _roiAtDragStart.top,
          math.max(_roiAtDragStart.right + delta.dx,
              _roiAtDragStart.left + minSize),
          math.max(_roiAtDragStart.bottom + delta.dy,
              _roiAtDragStart.top + minSize),
        );
        break;

      case _DragTarget.top:
        newDisplayRoi = Rect.fromLTRB(
          _roiAtDragStart.left,
          math.min(_roiAtDragStart.top + delta.dy,
              _roiAtDragStart.bottom - minSize),
          _roiAtDragStart.right,
          _roiAtDragStart.bottom,
        );
        break;

      case _DragTarget.bottom:
        newDisplayRoi = Rect.fromLTRB(
          _roiAtDragStart.left,
          _roiAtDragStart.top,
          _roiAtDragStart.right,
          math.max(_roiAtDragStart.bottom + delta.dy,
              _roiAtDragStart.top + minSize),
        );
        break;

      case _DragTarget.left:
        newDisplayRoi = Rect.fromLTRB(
          math.min(_roiAtDragStart.left + delta.dx,
              _roiAtDragStart.right - minSize),
          _roiAtDragStart.top,
          _roiAtDragStart.right,
          _roiAtDragStart.bottom,
        );
        break;

      case _DragTarget.right:
        newDisplayRoi = Rect.fromLTRB(
          _roiAtDragStart.left,
          _roiAtDragStart.top,
          math.max(_roiAtDragStart.right + delta.dx,
              _roiAtDragStart.left + minSize),
          _roiAtDragStart.bottom,
        );
        break;
    }

    // Clamp edges to display bounds.
    newDisplayRoi = Rect.fromLTRB(
      newDisplayRoi.left.clamp(0, widget.displaySize.width),
      newDisplayRoi.top.clamp(0, widget.displaySize.height),
      newDisplayRoi.right.clamp(0, widget.displaySize.width),
      newDisplayRoi.bottom.clamp(0, widget.displaySize.height),
    );

    widget.onChanged(_toImage(newDisplayRoi));
  }

  void _onPanEnd(DragEndDetails details) {
    _activeDrag = null;
  }

  // ── Build ───────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onPanStart: _onPanStart,
      onPanUpdate: _onPanUpdate,
      onPanEnd: _onPanEnd,
      child: CustomPaint(
        size: widget.displaySize,
        painter: _RoiPainter(
          displayRoi: _toDisplay(widget.roi),
          displaySize: widget.displaySize,
        ),
      ),
    );
  }
}

// ── Painter ─────────────────────────────────────────────────────────────────

class _RoiPainter extends CustomPainter {
  final Rect displayRoi;
  final Size displaySize;

  _RoiPainter({required this.displayRoi, required this.displaySize});

  @override
  void paint(Canvas canvas, Size size) {
    // Draw darkened overlay outside the ROI.
    final overlayPaint = Paint()..color = Colors.black.withValues(alpha: 0.5);
    final fullRect = Offset.zero & displaySize;

    // Save, clip out the ROI, draw overlay, restore.
    canvas.save();
    canvas.clipRect(displayRoi, clipOp: ClipOp.difference);
    canvas.drawRect(fullRect, overlayPaint);
    canvas.restore();

    // Draw ROI border.
    final borderPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;
    canvas.drawRect(displayRoi, borderPaint);

    // Draw corner handles.
    final handlePaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    final handleBorderPaint = Paint()
      ..color = Colors.blueAccent
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;

    for (final corner in [
      displayRoi.topLeft,
      displayRoi.topRight,
      displayRoi.bottomLeft,
      displayRoi.bottomRight,
    ]) {
      canvas.drawCircle(corner, _kHandleRadius, handlePaint);
      canvas.drawCircle(corner, _kHandleRadius, handleBorderPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _RoiPainter oldDelegate) {
    return displayRoi != oldDelegate.displayRoi;
  }
}
