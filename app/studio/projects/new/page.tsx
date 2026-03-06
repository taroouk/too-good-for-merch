// app/studio/projects/new/page.tsx
import { actionCreateBuild } from "src/actions/build-actions";

export default function NewProjectPage() {
  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Create Project</h1>
      <form action={actionCreateBuild} className="space-y-3">
        <label className="block text-sm">
          Name
          <input name="name" className="mt-1 w-full border rounded-md p-2" placeholder="e.g. Black Oversized Drop" />
        </label>
        <button className="border rounded-md px-4 py-2 text-sm hover:bg-gray-50" type="submit">
          Create
        </button>
      </form>
    </div>
  );
}