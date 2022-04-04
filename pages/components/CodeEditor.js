import dynamic from 'next/dynamic'
const ReactAce = dynamic(import('React-Ace'), {ssr: false})

import React, { Component } from 'react';

class CodeEditor extends Component {
  constructor() {
    super();
  }
  render() {
    if (typeof window !== "undefined") {
      return (
        <ReactAce
          mode="json"
          setReadOnly={false}
          onChange={this.props.onChange}
          style={{ height: '400px', width: "100%" }}
          value={this.props.value}
          ref={instance => { this.ace = instance; }}
          setOptions={{ useWorker: false }}
        />
      );
    }
  }
}
export default CodeEditor