interface LayoutInterface {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutInterface) => {
  return (
    <html>
      <head>
        <title>My Test App</title>
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
};

export default Layout;
