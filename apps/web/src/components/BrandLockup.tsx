type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <img
      className={`brand-symbol${className ? ` ${className}` : ""}`}
      src="/images/imara-symbol.png"
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

export function BrandWordmark({ className = "" }: BrandMarkProps) {
  return <span className={`brand-wordmark${className ? ` ${className}` : ""}`}>imara</span>;
}

export function BrandIdentity() {
  return (
    <>
      <BrandMark />
      <BrandWordmark />
    </>
  );
}
