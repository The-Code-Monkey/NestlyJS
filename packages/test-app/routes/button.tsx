"use client";

import React, { useState } from "react";
import "./button.css";

export default function Button({ label = "Click" }: { label?: string }) {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>
      {label} {count}
    </button>
  );
}
