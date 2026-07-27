import { login } from "../controllers/authController.js";
import { getBootstrap, getHealth } from "../controllers/bootstrapController.js";
import { createDepartmentRecord, listDepartments } from "../controllers/departmentController.js";
import { createTaskRecord, deleteTaskRecord, listTasks, updateTaskRecord } from "../controllers/taskController.js";
import { createUserRecord, listUsers, updateUserRecord } from "../controllers/userController.js";
import { sendJson } from "../utils/http.js";

export async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    getHealth(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    await getBootstrap(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    await login(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tasks") {
    await listTasks(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tasks") {
    await createTaskRecord(request, response);
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === "PATCH") {
    await updateTaskRecord(request, response, decodeURIComponent(taskMatch[1]));
    return;
  }

  if (taskMatch && request.method === "DELETE") {
    await deleteTaskRecord(request, response, decodeURIComponent(taskMatch[1]));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/users") {
    await listUsers(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/users") {
    await createUserRecord(request, response);
    return;
  }

  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && request.method === "PATCH") {
    await updateUserRecord(request, response, decodeURIComponent(userMatch[1]));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/departments") {
    await listDepartments(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/departments") {
    await createDepartmentRecord(request, response);
    return;
  }

  sendJson(response, 404, { error: "Route API introuvable." });
}
