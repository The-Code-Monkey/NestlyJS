import React from "react";

export default function BlogCatchAll({
  params,
}: {
  params: { rest: string[] };
}) {
  return <h1>Catch {params.rest.join("/")}</h1>;
}
