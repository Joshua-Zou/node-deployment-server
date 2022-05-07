import React from "react";
if (typeof window !== "undefined") {
  const { Terminal } = require("xterm")
  const { FitAddon } = require('xterm-addon-fit');
  const fitAddon = new FitAddon();
}

class TerminalComponent extends React.Component {
  constructor(props) {
    super(props);
    this.term = React.createRef(null);
    this.fitAddon = React.createRef(null);
    this.prevId = null;
    this.updateDimensions = this.updateDimensions.bind(this);
  }
  updateDimensions() {
    if (this.fitAddon.current) {
      this.fitAddon.current.fit();
    }
  }
  componentDidMount() {
    if (typeof window !== "undefined") {
      this.term.current = new Terminal({ convertEol: true, disableStdin: false });
      this.term.current.loadAddon(fitAddon);

      this.props.customRef.current = this.term.current;
      this.term.current.open(document.getElementById("terminal"));
      fitAddon.fit();
      this.fitAddon.current = fitAddon;
      window.addEventListener('resize', this.updateDimensions);
    }
  }
  componentWillUnmount() {
    window.removeEventListener('resize', this.updateDimensions);
  }
  render() {
    if (this.term.current) {
      if (this.prevId !== this.props.newText.id) {
        this.prevId = this.props.newText.id;
        this.term.current.writeln(this.props.newText.text);
      }
    }
    return <div id="terminal" />;
  }
}

export default TerminalComponent;