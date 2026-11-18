import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { clientIdFor, isClientComponent } from "./pageGraph";
import { clientInstanceKey, hydrationRootId } from "./pageDocument";

export interface ClientInstance {
  id: string;
  instanceKey: string;
  props: any;
}

export function attachFilePaths(mod: any, filePath: string) {
  if (!mod) return mod;
  const maybeTag = (comp: any) => {
    if (typeof comp === "function" && !comp.__filePath) {
      comp.__filePath = filePath;
    }
  };
  if (typeof mod === "function") maybeTag(mod);
  else if (typeof mod === "object") {
    for (const key of Object.keys(mod)) maybeTag(mod[key]);
  }
  return mod;
}

export async function renderAndWrap(
  element: any,
  instances: ClientInstance[] = [],
  counter = { value: 0 }
): Promise<any> {
  if (!element || typeof element !== "object") return element;
  if (Array.isArray(element)) {
    return Promise.all(
      element.map(async (child, index) => {
        const output = await renderAndWrap(child, instances, counter);
        if (React.isValidElement(output) && output.key == null) {
          return React.cloneElement(output, { key: index });
        }
        return output;
      })
    );
  }

  const type = element.type;
  const filePath = type?.__filePath;
  const clientId =
    type?.__clientId ??
    (filePath && isClientComponent(filePath) ? clientIdFor(filePath) : null);

  if (typeof type === "function" && clientId) {
    const instanceKey = clientInstanceKey(clientId, counter.value++);

    instances.push({
      id: clientId,
      instanceKey,
      props: element.props,
    });

    return React.createElement(
      "div",
      {
        key: element.key,
        id: hydrationRootId(instanceKey),
        "data-client-component": instanceKey,
        suppressHydrationWarning: true,
      },
      element
    );
  }

  if (typeof type === "function") {
    const isAsync = type.constructor?.name === "AsyncFunction";
    const output = isAsync ? await type(element.props) : type(element.props);
    return renderAndWrap(output, instances, counter);
  }

  if (element.props?.children) {
    const children = await renderAndWrap(
      React.Children.toArray(element.props.children),
      instances,
      counter
    );
    return React.cloneElement(element, element.props, children);
  }

  return element;
}

export async function renderPageTree(
  page: any,
  layouts: any[],
  params: Record<string, string | string[] | undefined>
) {
  let element: any = React.createElement(page, { params });
  for (const Layout of [...layouts].reverse()) {
    element = React.createElement(Layout, { children: element });
  }

  const instances: ClientInstance[] = [];
  const wrapped = await renderAndWrap(element, instances, { value: 0 });
  return {
    html: renderToStaticMarkup(wrapped),
    instances,
  };
}
