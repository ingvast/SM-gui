SM-GUI
######

This is a GUI for building Hirachial State Machines.
It is for creating input to the program described in docs/sm-builder-manual.pdf.
It will have possibility to save in its own format, and also possibility to export to a yaml file specified in the document docs/sm-builder-manual.pdf.



This app has a canvas for drawing rectangular states with transitions (arrows) between them.
When a state is selected, a property editor opens for setting the properties defined in entry/exit/do code.
The state name is shown centered top in the state.
Similarly the transitions have their property in a property editor.

When drawing a new node the key <n> places a rectangular state under the mouse pointer.  Clicking places it. Selecting one state, pressing <t> will wait for placing a 
transition arrow between states.

As should be understood from the sm-builder-manual, states can be placed in states.  Text in sub-states is smaller than the parent.  Once can zoom (with standard zooming keystrokes).
Transitions can pass borders of states.  For example, a transition in one state can point to the border of its parent or grand-parent, also its cousins.

There is a different type of state, the so called orthogonal states, those are marked with dashes in its outline.
