/** Catalog-authored phrases stay together while still wrapping under enlarged text. */
export function HeadingText({ text }: { text: string }) {
  return text.split('\n').map((line) => (
    <span className="heading-line" key={line}>
      {line}
      {'\n'}
    </span>
  ));
}
