import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { before, after, test } from "node:test";
import request from "supertest";

// These settings affect only this test process.
process.env.NODE_ENV = "test";
process.env.PGDATABASE = "taskflow_test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

const { default: app } = await import("../src/app.js");
const { pool } = await import("../src/db.js");

const suffix = randomUUID();
const password = "TaskFlowTest!2026";

const ownerEmail = `owner-${suffix}@example.com`;
const otherEmail = `other-${suffix}@example.com`;

const userIds = [];

let ownerToken;
let otherToken;
let projectId;

function authorized(method, path, token = ownerToken) {
  return request(app)[method](path)
    .set("Authorization", `Bearer ${token}`);
}

before(async () => {
  const database = await pool.query(
    "SELECT current_database() AS name"
  );

  assert.equal(
    database.rows[0].name,
    "taskflow_test",
    "Tests must use the separate taskflow_test database."
  );

  for (const email of [ownerEmail, otherEmail]) {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Test User",
        email,
        password,
      });

    assert.equal(response.status, 201);
    userIds.push(response.body.user.id);
  }

  const ownerLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: ownerEmail, password });

  assert.equal(ownerLogin.status, 200);
  ownerToken = ownerLogin.body.token;
  assert.ok(ownerToken);

  const otherLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: otherEmail, password });

  assert.equal(otherLogin.status, 200);
  otherToken = otherLogin.body.token;
  assert.ok(otherToken);

  const project = await authorized("post", "/api/projects")
    .send({
      name: "Automated Test Project",
      description: "Created by integration tests",
    });

  assert.equal(project.status, 201);
  projectId = project.body.project.id;
});

after(async () => {
  try {
    if (userIds.length > 0) {
      // Delete only records created by this test run.
      // Tasks are removed through the project's cascade relationship.
      await pool.query(
        "DELETE FROM projects WHERE owner_id = ANY($1::bigint[])",
        [userIds]
      );

      await pool.query(
        "DELETE FROM users WHERE id = ANY($1::bigint[])",
        [userIds]
      );
    }
  } finally {
    await pool.end();
  }
});

test("API health endpoint responds successfully", async () => {
  const response = await request(app).get("/api/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
});

test("Database health uses the test database", async () => {
  const response = await request(app).get("/api/health/db");

  assert.equal(response.status, 200);
  assert.equal(response.body.database, "taskflow_test");
});

test("Protected projects reject requests without a token", async () => {
  const response = await request(app).get("/api/projects");

  assert.equal(response.status, 401);
});

test("Protected projects reject invalid tokens", async () => {
  const response = await request(app)
    .get("/api/projects")
    .set("Authorization", "Bearer invalid-token");

  assert.equal(response.status, 401);
});

test("Registration rejects a short password", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Test User",
      email: `invalid-${suffix}@example.com`,
      password: "short",
    });

  assert.equal(response.status, 400);
});

test("Registration rejects duplicate email addresses", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Duplicate User",
      email: ownerEmail.toUpperCase(),
      password,
    });

  assert.equal(response.status, 409);
});

test("Login rejects an incorrect password", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({
      email: ownerEmail,
      password: "IncorrectPassword!2026",
    });

  assert.equal(response.status, 401);
  assert.equal(response.body.token, undefined);
});

test("Passwords are hashed and login responses exclude the hash", async () => {
  const result = await pool.query(
    "SELECT password_hash FROM users WHERE email = $1",
    [ownerEmail]
  );

  assert.notEqual(result.rows[0].password_hash, password);
  assert.match(result.rows[0].password_hash, /^\$2[aby]\$/);

  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: ownerEmail, password });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.password_hash, undefined);
});

test("Projects list contains only the logged-in user's projects", async () => {
  const ownerResponse = await authorized("get", "/api/projects");

  assert.equal(ownerResponse.status, 200);
  assert.ok(
    ownerResponse.body.projects.some(
      (project) => project.id === projectId
    )
  );

  const otherResponse = await authorized(
    "get",
    "/api/projects",
    otherToken
  );

  assert.equal(otherResponse.status, 200);
  assert.equal(
    otherResponse.body.projects.some(
      (project) => project.id === projectId
    ),
    false
  );
});

test("Task validation rejects short titles and impossible dates", async () => {
  const shortTitle = await authorized(
    "post",
    `/api/projects/${projectId}/tasks`
  ).send({ title: "A" });

  assert.equal(shortTitle.status, 400);

  const invalidDate = await authorized(
    "post",
    `/api/projects/${projectId}/tasks`
  ).send({
    title: "Invalid date test",
    due_date: "2026-02-30",
  });

  assert.equal(invalidDate.status, 400);
});

test("Task create, edit, status update and delete persist correctly", async () => {
  const path = `/api/projects/${projectId}/tasks`;

  const created = await authorized("post", path).send({
    title: "Original task",
    description: "Created by automated tests",
    priority: "HIGH",
    status: "TODO",
    due_date: "2026-12-20",
  });

  assert.equal(created.status, 201);

  const taskId = created.body.task.id;

  const edited = await authorized("put", `${path}/${taskId}`)
    .send({
      title: "Updated task",
      description: "Updated description",
      priority: "LOW",
      status: "IN_PROGRESS",
      due_date: null,
    });

  assert.equal(edited.status, 200);
  assert.equal(edited.body.task.title, "Updated task");
  assert.equal(edited.body.task.priority, "LOW");
  assert.equal(edited.body.task.due_date, null);

  const invalidStatus = await authorized(
    "patch",
    `${path}/${taskId}/status`
  ).send({ status: "INVALID" });

  assert.equal(invalidStatus.status, 400);

  const updatedStatus = await authorized(
    "patch",
    `${path}/${taskId}/status`
  ).send({ status: "DONE" });

  assert.equal(updatedStatus.status, 200);

  const listed = await authorized("get", path);
  assert.equal(listed.status, 200);

  const savedTask = listed.body.tasks.find(
    (task) => task.id === taskId
  );

  assert.ok(savedTask);
  assert.equal(savedTask.title, "Updated task");
  assert.equal(savedTask.status, "DONE");

  const deleted = await authorized(
    "delete",
    `${path}/${taskId}`
  );

  assert.equal(deleted.status, 200);

  const afterDelete = await authorized("get", path);
  assert.equal(afterDelete.status, 200);
  assert.equal(
    afterDelete.body.tasks.some((task) => task.id === taskId),
    false
  );
});

test("Another user cannot read, create, edit or delete project tasks", async () => {
  const path = `/api/projects/${projectId}/tasks`;

  const created = await authorized("post", path).send({
    title: "Owner-only task",
  });

  assert.equal(created.status, 201);
  const taskId = created.body.task.id;

  const attempts = [
    ["get", path, undefined],
    ["post", path, { title: "Unauthorized task" }],
    ["put", `${path}/${taskId}`, { title: "Unauthorized edit" }],
    ["patch", `${path}/${taskId}/status`, { status: "DONE" }],
    ["delete", `${path}/${taskId}`, undefined],
  ];

  for (const [method, url, body] of attempts) {
    const operation = authorized(method, url, otherToken);
    const response =
      body === undefined ? await operation : await operation.send(body);

    assert.equal(response.status, 404);
  }

  const ownerList = await authorized("get", path);
  assert.equal(ownerList.status, 200);

  const task = ownerList.body.tasks.find(
    (item) => item.id === taskId
  );

  assert.ok(task);
  assert.equal(task.title, "Owner-only task");
  assert.equal(task.status, "TODO");
});