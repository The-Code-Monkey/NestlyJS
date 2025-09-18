"use client";

import { useEffect } from "react";

const Page = () => {
  useEffect(() => {
    window.setTimeout(() => {
      console.log("Page rendered");
    }, 1000);
  }, []);

  return (
    <div>
      <h1>Welcome to the Page!</h1>
      <p>This is a sample page.</p>
    </div>
  );
};

export default Page;
