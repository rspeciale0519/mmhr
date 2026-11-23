import { CustomerFrame } from "./intake-views";

export default function CustomerLoading() {
  return (
    <CustomerFrame>
      <p role="status" className="co-status text-sm leading-6">
        Loading saved intake information.
      </p>
    </CustomerFrame>
  );
}
