"use client";

import { useEffect } from "react";

const Page = () => {
  useEffect(() => {
    console.log("Page mounted");
  }, []);

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
