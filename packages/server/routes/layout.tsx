interface LayoutInterface {
  children: React.ReactNode;
}

const Layout = async ({ children }: LayoutInterface) => {
  const test = await Promise.resolve("Hello World");

  console.log(test);

  return (
    <html>
      <head>
        <title>{test}</title>
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
};

export default Layout;
