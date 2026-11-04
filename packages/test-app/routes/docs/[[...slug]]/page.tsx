import React from "react";

export default function Docs({
  params,
}: {
  params: { slug?: string[] };
}) {
  return <h1>Docs {params.slug ? params.slug.join("/") : "home"}</h1>;
}
