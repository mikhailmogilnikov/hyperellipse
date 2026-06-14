export interface DetailExample {
  caption: string;
  css: string;
  figureClass?: string;
  previewClass: string;
}

export interface DetailExampleSubgroup {
  examples: DetailExample[];
  note?: string;
  title: string;
}

export interface DetailExampleGroup {
  examples?: DetailExample[];
  note?: string;
  subgroups?: DetailExampleSubgroup[];
  title: string;
}

const radius = "  border-radius: 28px;";

const shapeBlock = (shape: string) => `.block {
  --corner-shape: ${shape};
${radius}
}`;

const squircleBlock = (extra = "") => `.block {
  --corner-shape: squircle;
${radius}${extra}
}`;

export const detailExampleGroups: DetailExampleGroup[] = [
  {
    title: "Corner shapes",
    examples: [
      {
        caption: "Squircle",
        previewClass: "detail-example detail-example-shape-squircle",
        css: shapeBlock("squircle"),
      },
      {
        caption: "Superellipse",
        previewClass: "detail-example detail-example-shape-superellipse",
        css: shapeBlock("superellipse(4)"),
      },
      {
        caption: "Scoop",
        previewClass: "detail-example detail-example-shape-scoop",
        css: shapeBlock("scoop"),
      },
      {
        caption: "Notch",
        previewClass: "detail-example detail-example-shape-notch",
        css: shapeBlock("notch"),
      },
      {
        caption: "Per-corner mix",
        figureClass: "col-span-2",
        previewClass: "detail-example detail-example-shape-mixed",
        css: shapeBlock("squircle bevel scoop notch"),
      },
    ],
  },
  {
    title: "Style blocks",
    subgroups: [
      {
        title: "Static",
        examples: [
          {
            caption: "Fill",
            previewClass: "detail-example detail-example-deco-fill",
            css: squircleBlock(),
          },
          {
            caption: "Border",
            previewClass: "detail-example detail-example-deco-border",
            css: squircleBlock("\n  border: 2px solid rgb(0 0 0 / 0.2);"),
          },
          {
            caption: "Box shadow",
            previewClass: "detail-example detail-example-deco-shadow",
            css: squircleBlock("\n  box-shadow: 0 8px 20px rgb(0 0 0 / 0.25);"),
          },
          {
            caption: "Outline",
            previewClass: "detail-example detail-example-deco-outline",
            css: squircleBlock(`
  outline: 2px solid rgb(0 0 0 / 0.25);
  outline-offset: 5px;`),
          },
          {
            caption: "Gradient",
            previewClass: "detail-example detail-example-deco-gradient",
            css: squircleBlock(`
  background: linear-gradient(
    135deg,
    rgb(0 0 0 / 0.15),
    rgb(0 0 0 / 0.05)
  );`),
          },
          {
            caption: "Pill",
            previewClass: "detail-example detail-example-deco-pill",
            css: `.block {
  --corner-shape: squircle;
  border-radius: 50%;
}`,
          },
        ],
      },
      {
        title: "Hover",
        note: ":hover works in Safari and Firefox. Border, shadow, and outline update instantly — not mid-transition.",
        examples: [
          {
            caption: "Hover + border",
            previewClass: "detail-example-hover detail-example-hover-border",
            css: `${squircleBlock("\n  border: 2px solid rgb(0 0 0 / 0.2);")}

.block:hover {
  border-width: 4px;
}`,
          },
          {
            caption: "Hover + shadow",
            previewClass: "detail-example-hover detail-example-hover-shadow",
            css: `${squircleBlock("\n  box-shadow: 0 4px 12px rgb(0 0 0 / 0.15);")}

.block:hover {
  box-shadow: 0 10px 24px rgb(0 0 0 / 0.25);
}`,
          },
          {
            caption: "Hover + outline",
            previewClass: "detail-example-hover detail-example-hover-outline",
            css: `${squircleBlock(`
  outline: 2px solid rgb(0 0 0 / 0.25);
  outline-offset: 4px;`)}

.block:hover {
  outline-width: 4px;
  outline-offset: 6px;
}`,
          },
        ],
      },
      {
        title: "Animation",
        note: "Only size (width / height) is tracked during animation. Other property keyframes are deliberately ignored for performance reasons.",
        examples: [
          {
            caption: "Size + border",
            previewClass:
              "detail-example-anim detail-example-anim-size detail-example-anim-deco-border",
            css: `@keyframes breathe {
  0%,
  100% {
    width: 3.25rem;
    height: 3.25rem;
  }
  50% {
    width: 5.5rem;
    height: 5.5rem;
  }
}

${squircleBlock(`
  border: 2px solid rgb(0 0 0 / 0.2);
  animation: breathe 2.4s ease-in-out infinite;`)}`,
          },
          {
            caption: "Size + shadow",
            previewClass:
              "detail-example-anim detail-example-anim-stretch detail-example-anim-deco-shadow",
            css: `@keyframes stretch {
  0%,
  100% {
    width: 5.5rem;
    height: 3.25rem;
  }
  33% {
    width: 3.5rem;
    height: 5rem;
  }
  66% {
    width: 5rem;
    height: 3.5rem;
  }
}

${squircleBlock(`
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.25);
  animation: stretch 3s ease-in-out infinite;`)}`,
          },
          {
            caption: "Size + outline",
            previewClass:
              "detail-example-anim detail-example-anim-size detail-example-anim-deco-outline",
            css: `@keyframes breathe {
  0%,
  100% {
    width: 3.25rem;
    height: 3.25rem;
  }
  50% {
    width: 5.5rem;
    height: 5.5rem;
  }
}

${squircleBlock(`
  outline: 2px solid rgb(0 0 0 / 0.25);
  outline-offset: 5px;
  animation: breathe 2.4s ease-in-out infinite;`)}`,
          },
        ],
      },
    ],
  },
];
