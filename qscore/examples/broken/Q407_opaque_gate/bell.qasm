OPENQASM 2.0;
include "qelib1.inc";
opaque magic a,b;
qreg q[2];
h q[0];
magic q[0],q[1];
