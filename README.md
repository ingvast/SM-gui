SM-GUI
######

This is a GUI for building Hirachial State Machines.
It is for creating input to the program described in docs/sm-builder-manual.pdf.
It will have possibility to save in its own format, and also possibility to export to a yaml file specified in the document docs/sm-builder-manual.pdf.

Interface
=========
Improvement change
------------------
I once took the decision to only allow selection of one node at a time.  It has proven itself too restrictive.
So I want to change the interface so to able to manipulate more than one node at a time
With node I mean an item in the interface such as
    state (of all sorts)
    pseudo-transitions (normal, AND)
    initial

So I do not mean individual text object belonging to some of the above. Nor any transitions.

There are rules to what can be selected.
The selected objects all need to be in the same hirearchial level and branch.
Trying a add something from a different branch and level is silently refused.


Adding to selection

click on an object
ctrl-click on objects add to selection. Only added if within the same compound state.

Mouse-down drag a rectangle with shift selects everything within.  When dragging
from left to right everything must be fully within, dragging from right to left everything touching.
The state in which the mouse is down defines what compound state we select in, so anything not belonging to that 
is not included.  
Ctrl while mouse-drag adds to the selection.

When doing mouse drag, every direct child of the compound state must be shown.

The mouse-down on a state has earlier meant it moves it. However, to trigger the move, the mousedown should be sufficently close to the state edge.
However, on states not being compound mousedown-drag should move the state.

Once several states are selected, they can be copied, duplicated and moved.
When copying several nodes, all transitions within them should follow.

When several nodes are selected, nothing of state name Entry exit ..., or transitions should be shown in properties panel.



BUGS
====
* Ctrl-S does not work for save when cursor is in an input field.


