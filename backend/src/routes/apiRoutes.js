import { changePassword, login, logout } from "../controllers/authController.js";
import { getBootstrap, getHealth } from "../controllers/bootstrapController.js";
import { createDepartmentRecord, listDepartments } from "../controllers/departmentController.js";
import { createTaskRecord, deleteTaskRecord, listTasks, updateTaskRecord } from "../controllers/taskController.js";
import { createUserRecord, listUsers, updateUserRecord } from "../controllers/userController.js";
import { authenticateRequest, requireSupervisor } from "../security/authorization.js";
import { sendJson } from "../utils/http.js";

export async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    await getHealth(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    await login(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    if (await authenticateRequest(request, response, { allowPasswordChange: true })) await logout(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/change-password") {
    if (await authenticateRequest(request, response, { allowPasswordChange: true })) await changePassword(request, response);
    return;
  }

  if (!(await authenticateRequest(request, response))) return;

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    await getBootstrap(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tasks") {
    await listTasks(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tasks") {
    if (requireSupervisor(request, response)) await createTaskRecord(request, response);
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === "PATCH") {
    await updateTaskRecord(request, response, decodeURIComponent(taskMatch[1]));
    return;
  }

  if (taskMatch && request.method === "DELETE") {
    if (requireSupervisor(request, response)) await deleteTaskRecord(request, response, decodeURIComponent(taskMatch[1]));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/users") {
    if (requireSupervisor(request, response)) await listUsers(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/users") {
    if (requireSupervisor(request, response)) await createUserRecord(request, response);
    return;
  }

  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && request.method === "PATCH") {
    if (requireSupervisor(request, response)) await updateUserRecord(request, response, decodeURIComponent(userMatch[1]));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/departments") {
    await listDepartments(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/departments") {
    if (requireSupervisor(request, response)) await createDepartmentRecord(request, response);
    return;
  }

  sendJson(response, 404, { error: "Route API introuvable.", code: "NOT_FOUND" });
}
