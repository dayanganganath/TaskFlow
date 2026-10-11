import { useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5005/api";

export default function App() {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [session, setSession] = useState(null);
  const [projects, setProjects] = useState([]);

  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function fetchProjects(token) {
    setProjectsLoading(true);

    try {
      const response = await fetch(`${API_URL}/projects`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setSession(null);
          setProjects([]);
        }

        throw new Error(data.message || "Unable to load projects.");
      }

      setProjects(data.projects);
    } catch (err) {
      setError(err.message || "Unable to connect to the server.");
    } finally {
      setProjectsLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (mode === "register" && name.trim().length < 2) {
      setError("Please enter your name using at least 2 characters.");
      return;
    }

    if (
      mode === "register" &&
      (password.length < 8 ||
        new TextEncoder().encode(password).length > 72)
    ) {
      setError("Password must contain at least 8 characters and at most 72 bytes.");
      return;
    }

    setLoading(true);

    try {
      const body =
        mode === "register"
          ? { name: name.trim(), email: email.trim(), password }
          : { email: email.trim(), password };

      const response = await fetch(`${API_URL}/auth/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Request failed.");
      }

      if (mode === "register") {
        setMode("login");
        setPassword("");
        setSuccess("Account created. Please log in.");
      } else {
        setSession({
          token: data.token,
          user: data.user,
        });

        setPassword("");
        setProjects([]);
        await fetchProjects(data.token);
      }
    } catch (err) {
      setError(err.message || "Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  function changeMode() {
    setMode((current) =>
      current === "login" ? "register" : "login"
    );
    setError("");
    setSuccess("");
    setPassword("");
  }

  function logout() {
    setSession(null);
    setProjects([]);
    setName("");
    setEmail("");
    setPassword("");
    setError("");
    setSuccess("");
    setMode("login");
  }

  if (session) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <a className="brand" href="/">TaskFlow<span>.</span></a>

          <button
            className="secondary-button"
            onClick={logout}
            disabled={loading || projectsLoading}
          >
            Log out
          </button>
        </header>

        <main className="dashboard-content">
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Welcome, {session.user.name}</h1>
          <p className="muted">
            Keep your projects organized and your work moving.
          </p>

          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}

          <div className="section-heading">
            <h2>Your projects</h2>

            <button
              className="secondary-button"
              disabled={projectsLoading || loading}
              onClick={() => {
                setError("");
                fetchProjects(session.token);
              }}
            >
              {projectsLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {projectsLoading ? (
            <p className="muted" role="status">Loading projects...</p>
          ) : projects.length === 0 ? (
            <div className="empty-state">
              No projects to display.
            </div>
          ) : (
            <div className="project-grid">
              {projects.map((project) => (
                <article className="project-card" key={project.id}>
                  <span className="project-label">PROJECT</span>
                  <h3>{project.name}</h3>
                  <p>{project.description || "No description added."}</p>
                </article>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <main className="auth-layout">
      <section className="intro-panel">
        <div className="brand light">TaskFlow<span>.</span></div>

        <div className="intro-content">
          <p className="eyebrow">MAKE ROOM FOR FOCUSED WORK</p>
          <h1>Clear tasks.<br />Steady progress.</h1>
          <p>
            Bring your projects, priorities and daily work into
            one simple workspace.
          </p>

          <div className="feature-list">
            <span>Organize your projects</span>
            <span>Track what matters</span>
            <span>Move work forward</span>
          </div>
        </div>

        <p className="intro-footer">
          A little structure. A better working day.
        </p>
      </section>

      <section className="form-panel">
        <div className="auth-card">
          <p className="eyebrow">
            {mode === "login" ? "WELCOME BACK" : "GET STARTED"}
          </p>

          <h2>
            {mode === "login"
              ? "Log in to your workspace"
              : "Create your account"}
          </h2>

          <p className="muted">
            {mode === "login"
              ? "Your next step starts here."
              : "Start organizing your work with TaskFlow."}
          </p>

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

          <form onSubmit={handleSubmit}>
            {mode === "register" && (
              <div className="field">
                <label htmlFor="name">Full name</label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={100}
                  disabled={loading}
                  required
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                disabled={loading}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete={
                  mode === "register"
                    ? "new-password"
                    : "current-password"
                }
                placeholder={
                  mode === "register"
                    ? "At least 8 characters"
                    : "Enter your password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
                required
              />
            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Log in"
                  : "Create account"}
            </button>
          </form>

          <p className="switch-text">
            {mode === "login"
              ? "New to TaskFlow?"
              : "Already have an account?"}

            <button
              type="button"
              className="text-button"
              onClick={changeMode}
              disabled={loading}
            >
              {mode === "login" ? "Create an account" : "Log in"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}