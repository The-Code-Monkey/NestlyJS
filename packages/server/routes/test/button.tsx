"use client";

const Button = ({ name }: { name: string }) => {
  const handleClick = () => {
    window.alert("Button:" + name + " clicked!");
  };

  return <button onClick={handleClick}>Click me! {name}</button>;
};

export default Button;
