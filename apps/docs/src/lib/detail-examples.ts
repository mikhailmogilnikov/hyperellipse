export interface DetailExample {
  caption: string;
  figureClass?: string;
  label: string;
  previewClass: string;
  previewWrapper?: "stage";
}

export interface DetailExampleGroup {
  examples: DetailExample[];
  note?: string;
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
  {
    title: "Animations",
    note: "In the Safari / Firefox fallback, only size (width / height) is tracked during animation. Other property keyframes are deliberately ignored for performance reasons.",
    examples: [
      {
        caption: "Size + border",
        label: "width/height · border 2px",
        previewWrapper: "stage",
        previewClass:
          "detail-example-anim detail-example-anim-size detail-example-anim-deco-border",
      },
      {
        caption: "Size + shadow",
        label: "width/height · box-shadow",
        previewWrapper: "stage",
        previewClass:
          "detail-example-anim detail-example-anim-stretch detail-example-anim-deco-shadow",
      },
      {
        caption: "Size + outline",
        label: "width/height · outline",
        previewWrapper: "stage",
        previewClass:
          "detail-example-anim detail-example-anim-size detail-example-anim-deco-outline",
      },
    ],
  },
];
