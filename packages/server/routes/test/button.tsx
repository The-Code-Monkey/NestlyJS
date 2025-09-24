"use client";

import { useState } from "react";

const Button = ({ name }: { name: string }) => {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    window.alert("Button:" + name + " clicked!");
    setCount(count + 1);
    console.log("Count:", count);
  };

  return (
    <button onClick={handleClick}>
      Click me! {name} {count}
    </button>
  );
};

export default Button;
