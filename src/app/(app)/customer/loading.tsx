import { CustomerFrame } from "./intake-views";

export default function CustomerLoading() {
  return (
    <CustomerFrame>
      <p role="status" className="border-l-2 border-foreground py-2 pl-5 text-sm leading-6">
        Loading saved intake information.
      </p>
    </CustomerFrame>
  );
}
