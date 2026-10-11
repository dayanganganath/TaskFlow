import { useState } from "react";

const API_URL = "http://localhost:5005/api";

const emptyForm = {
  title: "",
  description: "",
  priority: "MEDIUM",
  status: "TODO",
  due_date: "",
};

const statuses = [
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
];

export default function ProjectTasks({
  projects,
  token,
  onUnauthorized,
}) {
  const [selectedProject, setSelectedProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function request(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
      },
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        onUnauthorized();
      }

      throw new Error(data.message || "Request failed.");
    }

    return data;
  }

  function resetForm() {
    setForm({ ...emptyForm });
    setEditingId(null);
  }

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  async function openProject(project) {
    setSelectedProject(project);
    setTasks([]);
    resetForm();
    clearMessages();
    setLoadFailed(false);
    setLoading(true);

    try {
      const data = await request(`/projects/${project.id}/tasks`);
      setTasks(data.tasks);
    } catch (err) {
      setLoadFailed(true);
      setError(err.message || "Unable to load tasks.");
    } finally {
      setLoading(false);
    }
  }

  function changeField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function startEditing(task) {
    clearMessages();
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      status: task.status,
      due_date: task.due_date || "",
    });
  }

  async function saveTask(event) {
    event.preventDefault();
    clearMessages();

    if (form.title.trim().length < 2) {
      setError("Task title must contain at least 2 characters.");
      return;
    }

    setBusy(true);

    try {
      const path = editingId
        ? `/projects/${selectedProject.id}/tasks/${editingId}`
        : `/projects/${selectedProject.id}/tasks`;

      const data = await request(path, {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          priority: form.priority,
          status: form.status,
          due_date: form.due_date || null,
        }),
      });

      if (editingId) {
        setTasks((current) =>
          current.map((task) =>
            task.id === data.task.id ? data.task : task
          )
        );
      } else {
        setTasks((current) => [data.task, ...current]);
      }

      setSuccess(
        editingId
          ? "Task updated successfully."
          : "Task added successfully."
      );

      resetForm();
    } catch (err) {
      setError(err.message || "Unable to save task.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(task, status) {
    if (status === task.status) return;

    clearMessages();
    setBusy(true);

    try {
      const data = await request(
        `/projects/${selectedProject.id}/tasks/${task.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );

      setTasks((current) =>
        current.map((item) =>
          item.id === data.task.id ? data.task : item
        )
      );

      if (editingId === task.id) {
        setForm((current) => ({
          ...current,
          status: data.task.status,
        }));
      }

      setSuccess("Task status updated successfully.");
    } catch (err) {
      setError(err.message || "Unable to update status.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask(task) {
    const confirmed = window.confirm(
      `Delete "${task.title}"? This cannot be undone.`
    );

    if (!confirmed) return;

    clearMessages();
    setBusy(true);

    try {
      await request(
        `/projects/${selectedProject.id}/tasks/${task.id}`,
        { method: "DELETE" }
      );

      setTasks((current) =>
        current.filter((item) => item.id !== task.id)
      );

      if (editingId === task.id) resetForm();

      setSuccess("Task deleted successfully.");
    } catch (err) {
      setError(err.message || "Unable to delete task.");
    } finally {
      setBusy(false);
    }
  }

  function backToProjects() {
    setSelectedProject(null);
    setTasks([]);
    setLoadFailed(false);
    resetForm();
    clearMessages();
  }

  if (!selectedProject) {
    return projects.length === 0 ? (
      <div className="empty-state">No projects to display.</div>
    ) : (
      <div className="project-grid">
        {projects.map((project) => (
          <article className="project-card" key={project.id}>
            <span className="project-label">PROJECT</span>
            <h3>{project.name}</h3>
            <p>{project.description || "No description added."}</p>

            <button
              className="secondary-button"
              onClick={() => openProject(project)}
            >
              Open project
            </button>
          </article>
        ))}
      </div>
    );
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">PROJECT WORKSPACE</p>
          <h2>{selectedProject.name}</h2>
        </div>

        <button
          className="secondary-button"
          onClick={backToProjects}
          disabled={loading || busy}
        >
          Back to projects
        </button>
      </div>

      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="message success" role="status">
          {success}
        </div>
      )}

      {loading ? (
        <p className="muted" role="status">Loading tasks...</p>
      ) : loadFailed ? (
        <button
          className="secondary-button"
          onClick={() => openProject(selectedProject)}
        >
          Retry loading tasks
        </button>
      ) : (
        <div className="tasks-layout">
          <div className="tasks-list">
            <h3>Tasks ({tasks.length})</h3>

            {tasks.length === 0 ? (
              <div className="empty-state">
                No tasks yet. Add your first task.
              </div>
            ) : (
              tasks.map((task) => (
                <article className="task-card" key={task.id}>
                  <div className="task-badges">
                    <span
                      className={`task-badge status-${task.status}`}
                    >
                      {task.status.replaceAll("_", " ")}
                    </span>

                    <span
                      className={`task-badge priority-${task.priority}`}
                    >
                      {task.priority} PRIORITY
                    </span>
                  </div>

                  <h3>{task.title}</h3>

                  {task.description && <p>{task.description}</p>}

                  <p className="task-date">
                    Due: {task.due_date || "No due date"}
                  </p>

                  <div className="task-actions">
                    <div className="task-status-control">
                      <label htmlFor={`status-${task.id}`}>
                        Status
                      </label>

                      <select
                        id={`status-${task.id}`}
                        value={task.status}
                        disabled={busy}
                        onChange={(event) =>
                          changeStatus(task, event.target.value)
                        }
                      >
                        {statuses.map((status) => (
                          <option
                            key={status.value}
                            value={status.value}
                          >
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => startEditing(task)}
                    >
                      Edit
                    </button>

                    <button
                      className="danger-button"
                      disabled={busy}
                      onClick={() => deleteTask(task)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <form className="task-form" onSubmit={saveTask}>
            <h3>{editingId ? "Edit task" : "Add a task"}</h3>

            <fieldset disabled={busy}>
              <div className="field">
                <label htmlFor="task-title">Task title</label>
                <input
                  id="task-title"
                  name="title"
                  value={form.title}
                  onChange={changeField}
                  placeholder="What needs to be done?"
                  minLength={2}
                  maxLength={200}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="task-description">Description</label>
                <textarea
                  id="task-description"
                  name="description"
                  value={form.description}
                  onChange={changeField}
                  maxLength={5000}
                  rows={4}
                />
              </div>

              <div className="field">
                <label htmlFor="task-priority">Priority</label>
                <select
                  id="task-priority"
                  name="priority"
                  value={form.priority}
                  onChange={changeField}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="task-status">Status</label>
                <select
                  id="task-status"
                  name="status"
                  value={form.status}
                  onChange={changeField}
                >
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="task-due-date">Due date</label>
                <input
                  id="task-due-date"
                  type="date"
                  name="due_date"
                  value={form.due_date}
                  onChange={changeField}
                />
              </div>

              <button className="primary-button" type="submit">
                {busy
                  ? "Please wait..."
                  : editingId
                    ? "Save changes"
                    : "Add task"}
              </button>

              {editingId && (
                <button
                  className="secondary-button cancel-edit"
                  type="button"
                  onClick={() => {
                    resetForm();
                    clearMessages();
                  }}
                >
                  Cancel edit
                </button>
              )}
            </fieldset>
          </form>
        </div>
      )}
    </section>
  );
}