const Page = () => {
  return (
    <div>
      <h1>Welcome to the Page!</h1>
      <p>This is a sample page.</p>
      <script>
        {`(() => {
          console.log("Script executed");
        })();`}
      </script>
    </div>
  );
};

export default Page;
