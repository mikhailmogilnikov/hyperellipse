export interface DetailExample {
  caption: string;
  figureClass?: string;
  label: string;
  previewClass: string;
}

export interface DetailExampleGroup {
  examples: DetailExample[];
  title: string;
}

export const detailExampleGroups: DetailExampleGroup[] = [
  {
    title: "Corner shapes",
    examples: [
      {
        caption: "Squircle",
        label: "squircle",
        previewClass: "detail-example detail-example-shape-squircle",
      },
      {
        caption: "Superellipse",
        label: "superellipse(4)",
        previewClass: "detail-example detail-example-shape-superellipse",
      },
      {
        caption: "Scoop",
        label: "scoop",
        previewClass: "detail-example detail-example-shape-scoop",
      },
      {
        caption: "Notch",
        label: "notch",
        previewClass: "detail-example detail-example-shape-notch",
      },
      {
        caption: "Per-corner mix",
        figureClass: "col-span-2",
        label: "squircle bevel scoop notch",
        previewClass: "detail-example detail-example-shape-mixed",
      },
    ],
  },
  {
    title: "Decorations",
    examples: [
      {
        caption: "Fill",
        label: "background",
        previewClass: "detail-example detail-example-deco-fill",
      },
      {
        caption: "Border",
        label: "border 2px",
        previewClass: "detail-example detail-example-deco-border",
      },
      {
        caption: "Box shadow",
        label: "box-shadow",
        previewClass: "detail-example detail-example-deco-shadow",
      },
      {
        caption: "Outline",
        label: "outline + offset",
        previewClass: "detail-example detail-example-deco-outline",
      },
      {
        caption: "Gradient",
        label: "linear-gradient",
        previewClass: "detail-example detail-example-deco-gradient",
      },
      {
        caption: "Pill",
        label: "border-radius: 50%",
        previewClass: "detail-example detail-example-deco-pill",
      },
    ],
  },
];
