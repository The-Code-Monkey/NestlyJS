import Button from "./button";

const TestPage = async () => {
  const test = await Promise.resolve("Hello World");

  console.log(test);

  return (
    <div>
      <h1>Test Page {test}</h1>
      <Button name="Test Button" />
      <Button name="Another Button" />
    </div>
  );
};

export default TestPage;
