export interface RealWorldUiExample {
  caption: string;
  figureClass?: string;
  label: string;
  variant:
    | "avatar"
    | "badge"
    | "icon-button"
    | "list-item"
    | "primary-button"
    | "search"
    | "secondary-button"
    | "toast";
}

export const realWorldUiExamples: RealWorldUiExample[] = [
  {
    caption: "Primary button",
    label: "squircle · fill · shadow",
    variant: "primary-button",
  },
  {
    caption: "Secondary button",
    label: "squircle · border · shadow",
    variant: "secondary-button",
  },
  {
    caption: "Search field",
    label: "squircle · border",
    variant: "search",
  },
  {
    caption: "Icon button",
    label: "squircle · border",
    variant: "icon-button",
  },
  {
    caption: "Avatar",
    label: "squircle · fill",
    variant: "avatar",
  },
  {
    caption: "Badge",
    label: "squircle · fill",
    variant: "badge",
  },
  {
    caption: "List item",
    label: "squircle · border · shadow",
    variant: "list-item",
  },
  {
    caption: "Toast",
    label: "squircle · border · shadow",
    variant: "toast",
  },
];
