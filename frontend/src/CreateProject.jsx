import { useState } from "react";

const API_URL = "/api";

export default function CreateProject({
  token,
  onCreated,
  onUnauthorized,
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Project name must contain at least 2 characters.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`${API_URL}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          onUnauthorized();
        }

        throw new Error(data.message || "Unable to create project.");
      }

      onCreated(data.project);
      setName("");
      setDescription("");
      setOpen(false);
    } catch (err) {
      setError(err.message || "Unable to connect to the server.");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setOpen(false);
    setName("");
    setDescription("");
    setError("");
  }

  return (
    <section className="create-project-section">
      {!open ? (
        <button
          className="secondary-button"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          + New project
        </button>
      ) : (
        <form className="task-form" onSubmit={handleSubmit}>
          <h3>Create a project</h3>

          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}

          <fieldset disabled={saving}>
            <div className="field">
              <label htmlFor="project-name">Project name</label>
              <input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter project name"
                minLength={2}
                maxLength={150}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="project-description">Description</label>
              <textarea
                id="project-description"
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                placeholder="What is this project about?"
                maxLength={5000}
                rows={3}
              />
            </div>

            <div className="create-project-actions">
              <button className="primary-button" type="submit">
                {saving ? "Creating..." : "Create project"}
              </button>

              <button
                className="secondary-button"
                type="button"
                onClick={cancel}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}