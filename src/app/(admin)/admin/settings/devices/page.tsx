import DevicesClient from "./DevicesClient";

export const metadata = {
  title: "Mobile Devices",
};

export default function Page() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Mobile Devices</h1>
        <p className="text-sm text-neutral-600">
          ApiKeys erstellen, Devices verwalten und Forms zuweisen (tenant-scoped).
        </p>
      </div>

      <DevicesClient />
    </div>
  );
}
