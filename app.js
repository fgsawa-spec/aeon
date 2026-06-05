(function () {
  "use strict";

  var STORAGE_KEY = "aeonInventoryApp.v1";
  var DRAFT_STORAGE_KEY = "aeonInventoryDrafts.v1";
  var state = loadState();
  var movementDrafts = loadMovementDrafts();
  var sortState = { key: "default", direction: "asc" };

  var productForm = document.getElementById("productForm");
  var importFile = document.getElementById("importFile");
  var searchInput = document.getElementById("searchInput");
  var productFormTitle = document.getElementById("productFormTitle");
  var saveProductButton = document.getElementById("saveProductButton");
  var cancelEditButton = document.getElementById("cancelEditButton");
  var draftSummary = document.getElementById("draftSummary");

  productForm.addEventListener("submit", handleProductSubmit);
  cancelEditButton.addEventListener("click", resetProductForm);
  document.getElementById("exportButton").addEventListener("click", exportJson);
  document.getElementById("clearDataButton").addEventListener("click", clearAllData);
  document.getElementById("clearHistoryButton").addEventListener("click", clearHistory);
  document.getElementById("bulkInButton").addEventListener("click", function () { applyBulkMovement("in"); });
  document.getElementById("bulkOutButton").addEventListener("click", function () { applyBulkMovement("out"); });
  document.getElementById("clearDraftButton").addEventListener("click", clearMovementDrafts);
  importFile.addEventListener("change", importJson);
  searchInput.addEventListener("input", renderAll);

  Array.prototype.forEach.call(document.querySelectorAll(".sort-button"), function (button) {
    button.addEventListener("click", function () {
      var key = button.dataset.sortKey;
      if (sortState.key === key) {
        sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
      } else {
        sortState.key = key;
        sortState.direction = "asc";
      }
      renderInventory();
    });
  });

  renderAll();

  function loadState() {
    var fallback = { products: [], movements: [] };
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return fallback;
      }
      var parsed = JSON.parse(raw);
      return {
        products: Array.isArray(parsed.products) ? parsed.products : [],
        movements: Array.isArray(parsed.movements) ? parsed.movements : []
      };
    } catch (error) {
      alert("保存データの読み込みに失敗しました。新しいデータとして開始します。");
      return fallback;
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadMovementDrafts() {
    try {
      var raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveMovementDrafts() {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(movementDrafts));
  }

  function renderAll() {
    renderMetrics();
    renderInventory();
    renderHistory();
    updateDraftSummary();
  }

  function renderMetrics() {
    document.getElementById("productCount").textContent = String(state.products.length);
    document.getElementById("totalQuantity").textContent = String(
      state.products.reduce(function (total, product) {
        return total + toInteger(product.quantity, 0);
      }, 0)
    );
    document.getElementById("movementCount").textContent = String(state.movements.length);
  }

  function renderInventory() {
    var body = document.getElementById("inventoryBody");
    body.innerHTML = "";

    updateSortButtons();

    var products = getVisibleProducts();
    if (products.length === 0) {
      body.appendChild(getEmptyRow(10));
      return;
    }

    products.forEach(function (product) {
      var row = document.createElement("tr");
      row.appendChild(createCell(product.productCode));
      row.appendChild(createCell(product.size));
      row.appendChild(createCell(product.name));
      row.appendChild(createCell(product.color));
      row.appendChild(createCell(product.cartonSize, "number-cell"));
      row.appendChild(createCell(product.quantity, "number-cell"));
      row.appendChild(createCell(formatCartonRemainder(product), "number-cell"));
      row.appendChild(createDraftInputCell(product, "quantity"));
      row.appendChild(createDraftInputCell(product, "cartons"));
      row.appendChild(createActionsCell(product));
      body.appendChild(row);
    });
  }

  function renderHistory() {
    var body = document.getElementById("historyBody");
    body.innerHTML = "";

    if (state.movements.length === 0) {
      body.appendChild(getEmptyRow(7));
      return;
    }

    state.movements
      .slice()
      .sort(function (a, b) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .forEach(function (movement) {
        var row = document.createElement("tr");
        row.appendChild(createCell(formatDateTime(movement.createdAt)));
        row.appendChild(createCell(movement.type === "in" ? "入庫" : "出庫", movement.type === "in" ? "movement-in" : "movement-out"));
        row.appendChild(createCell(movement.productCode));
        row.appendChild(createCell(movement.productName));
        row.appendChild(createCell(movement.quantity, "number-cell"));
        row.appendChild(createCell(movement.cartons, "number-cell"));
        row.appendChild(createCell(movement.memo));
        body.appendChild(row);
      });
  }

  function getVisibleProducts() {
    var keyword = normalize(searchInput.value);
    var products = state.products.filter(function (product) {
      if (!keyword) {
        return true;
      }
      return [product.productCode, product.name, product.size, product.color].some(function (value) {
        return normalize(value).indexOf(keyword) !== -1;
      });
    });

    if (sortState.key === "default") {
      return products.sort(defaultProductSort);
    }

    return products.sort(function (a, b) {
      var result = compareValue(a[sortState.key], b[sortState.key]);
      return sortState.direction === "asc" ? result : -result;
    });
  }

  function defaultProductSort(a, b) {
    return compareValue(a.productCode, b.productCode) ||
      compareValue(a.color, b.color) ||
      compareValue(a.name, b.name);
  }

  function compareValue(a, b) {
    if (typeof a === "number" || typeof b === "number") {
      return toInteger(a, 0) - toInteger(b, 0);
    }
    return String(a || "").localeCompare(String(b || ""), "ja", { numeric: true, sensitivity: "base" });
  }

  function updateSortButtons() {
    Array.prototype.forEach.call(document.querySelectorAll(".sort-button"), function (button) {
      var active = button.dataset.sortKey === sortState.key;
      button.classList.toggle("active", active);
      button.dataset.direction = active && sortState.direction === "asc" ? "▲" : "▼";
    });
  }

  function handleProductSubmit(event) {
    event.preventDefault();

    var editingId = document.getElementById("editingProductId").value;
    var productCode = document.getElementById("productCode").value.trim();
    var name = document.getElementById("productName").value.trim();
    var size = document.getElementById("productSize").value.trim();
    var color = document.getElementById("productColor").value.trim();
    var quantity = toInteger(document.getElementById("productQuantity").value, 0);
    var cartonSize = toInteger(document.getElementById("cartonSize").value, 1);

    if (!productCode || !name) {
      alert("品番と品名を入力してください。");
      return;
    }
    if (quantity < 0) {
      alert("数量は0以上で入力してください。");
      return;
    }
    if (cartonSize < 1) {
      alert("カートン入数は1以上で入力してください。");
      return;
    }

    var duplicate = state.products.find(function (product) {
      return product.id !== editingId &&
        product.productCode === productCode &&
        product.name === name &&
        product.size === size &&
        product.color === color;
    });

    if (duplicate) {
      alert("同じ品番・品名・サイズ・色の商品がすでに登録されています。");
      return;
    }

    if (editingId) {
      var existing = state.products.find(function (product) { return product.id === editingId; });
      if (!existing) {
        alert("編集中の商品が見つかりません。");
        resetProductForm();
        return;
      }
      existing.productCode = productCode;
      existing.name = name;
      existing.size = size;
      existing.color = color;
      existing.quantity = quantity;
      existing.cartonSize = cartonSize;
      existing.updatedAt = new Date().toISOString();
    } else {
      state.products.push({
        id: createId("product"),
        productCode: productCode,
        name: name,
        size: size,
        color: color,
        quantity: quantity,
        cartonSize: cartonSize,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    saveState();
    resetProductForm();
    renderAll();
  }

  function editProduct(id) {
    var product = state.products.find(function (item) { return item.id === id; });
    if (!product) {
      return;
    }

    document.getElementById("editingProductId").value = product.id;
    document.getElementById("productCode").value = product.productCode;
    document.getElementById("productName").value = product.name;
    document.getElementById("productSize").value = product.size;
    document.getElementById("productColor").value = product.color;
    document.getElementById("productQuantity").value = product.quantity;
    document.getElementById("cartonSize").value = product.cartonSize;
    productFormTitle.textContent = "商品編集";
    saveProductButton.textContent = "変更を保存";
    cancelEditButton.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteProduct(id) {
    var product = state.products.find(function (item) { return item.id === id; });
    if (!product) {
      return;
    }
    if (!confirm(product.productCode + " / " + product.name + " を削除しますか？履歴は残ります。")) {
      return;
    }

    state.products = state.products.filter(function (item) { return item.id !== id; });
    delete movementDrafts[id];
    saveState();
    saveMovementDrafts();
    renderAll();
  }

  function resetProductForm() {
    productForm.reset();
    document.getElementById("editingProductId").value = "";
    document.getElementById("productQuantity").value = "0";
    document.getElementById("cartonSize").value = "1";
    productFormTitle.textContent = "商品登録";
    saveProductButton.textContent = "商品を登録";
    cancelEditButton.classList.add("hidden");
  }

  function exportJson() {
    var payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      products: state.products,
      movements: state.movements
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "inventory-" + formatDateForFile(new Date()) + ".json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function importJson(event) {
    var file = event.target.files[0];
    if (!file) {
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result || ""));
        if (!Array.isArray(parsed.products) || !Array.isArray(parsed.movements)) {
          throw new Error("Invalid inventory file");
        }
        if (!confirm("現在のデータを読み込んだJSONで置き換えますか？")) {
          importFile.value = "";
          return;
        }
        state = {
          products: parsed.products.map(normalizeProduct),
          movements: parsed.movements.map(normalizeMovement)
        };
        movementDrafts = {};
        saveState();
        saveMovementDrafts();
        resetProductForm();
        importFile.value = "";
        renderAll();
      } catch (error) {
        alert("JSONを読み込めませんでした。在庫管理アプリで出力したファイルを選択してください。");
        importFile.value = "";
      }
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    if (!confirm("商品・履歴をすべて削除しますか？この操作は元に戻せません。")) {
      return;
    }
    state = { products: [], movements: [] };
    movementDrafts = {};
    saveState();
    saveMovementDrafts();
    resetProductForm();
    renderAll();
  }

  function clearHistory() {
    if (!confirm("入出庫履歴をすべて削除しますか？在庫数は変更されません。")) {
      return;
    }
    state.movements = [];
    saveState();
    renderAll();
  }

  function applyBulkMovement(type) {
    var entries = state.products.map(function (product) {
      var draft = getMovementDraft(product.id);
      var quantityInput = Math.max(0, toInteger(draft.quantity, 0));
      var cartons = Math.max(0, toInteger(draft.cartons, 0));
      var totalQuantity = quantityInput + cartons * Math.max(1, toInteger(product.cartonSize, 1));
      return {
        product: product,
        quantityInput: quantityInput,
        cartons: cartons,
        totalQuantity: totalQuantity
      };
    }).filter(function (entry) {
      return entry.totalQuantity > 0;
    });

    if (entries.length === 0) {
      alert("入出庫する数量またはカートン数を入力してください。");
      return;
    }

    if (type === "out") {
      var shortage = entries.find(function (entry) {
        return entry.product.quantity < entry.totalQuantity;
      });
      if (shortage) {
        alert(
          "在庫が不足しています。\n" +
          shortage.product.productCode + " / " + shortage.product.name +
          "\n現在庫: " + shortage.product.quantity +
          "\n出庫数量: " + shortage.totalQuantity
        );
        return;
      }
    }

    var createdAt = new Date().toISOString();
    entries.forEach(function (entry) {
      var product = entry.product;
      product.quantity = type === "in" ? product.quantity + entry.totalQuantity : product.quantity - entry.totalQuantity;
      product.updatedAt = createdAt;
      state.movements.push({
        id: createId("movement"),
        productId: product.id,
        type: type,
        productCode: product.productCode,
        productName: product.name,
        productColor: product.color,
        productSize: product.size,
        quantity: entry.totalQuantity,
        cartons: entry.cartons,
        cartonSizeAtTime: product.cartonSize,
        memo: "一覧一括" + (type === "in" ? "入庫" : "出庫"),
        createdAt: createdAt
      });
      delete movementDrafts[product.id];
    });

    saveState();
    saveMovementDrafts();
    renderAll();
  }

  function clearMovementDrafts() {
    var hasDraft = Object.keys(movementDrafts).some(function (productId) {
      var draft = getMovementDraft(productId);
      return toInteger(draft.quantity, 0) > 0 || toInteger(draft.cartons, 0) > 0;
    });
    if (!hasDraft) {
      return;
    }
    if (!confirm("入力中の入出庫数量をすべて消しますか？")) {
      return;
    }
    movementDrafts = {};
    saveMovementDrafts();
    renderInventory();
    updateDraftSummary();
  }

  function getMovementDraft(productId) {
    var draft = movementDrafts[productId];
    return draft && typeof draft === "object" ? draft : { quantity: "", cartons: "" };
  }

  function updateMovementDraft(productId, field, value) {
    var draft = movementDrafts[productId];
    if (!draft || typeof draft !== "object") {
      draft = { quantity: "", cartons: "" };
      movementDrafts[productId] = draft;
    }
    draft[field] = value;
    if (toInteger(draft.quantity, 0) <= 0 && toInteger(draft.cartons, 0) <= 0) {
      delete movementDrafts[productId];
    }
    saveMovementDrafts();
    updateDraftSummary();
  }

  function updateDraftSummary() {
    var total = state.products.reduce(function (sum, product) {
      var draft = getMovementDraft(product.id);
      var quantity = Math.max(0, toInteger(draft.quantity, 0));
      var cartons = Math.max(0, toInteger(draft.cartons, 0));
      return sum + quantity + cartons * Math.max(1, toInteger(product.cartonSize, 1));
    }, 0);
    draftSummary.textContent = "入力合計: " + total;
  }

  function createActionsCell(product) {
    var cell = document.createElement("td");
    var actions = document.createElement("div");
    actions.className = "row-actions";

    var editButton = document.createElement("button");
    editButton.className = "small-button";
    editButton.type = "button";
    editButton.textContent = "編集";
    editButton.addEventListener("click", function () {
      editProduct(product.id);
    });

    var deleteButton = document.createElement("button");
    deleteButton.className = "small-button danger";
    deleteButton.type = "button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", function () {
      deleteProduct(product.id);
    });

    actions.appendChild(editButton);
    actions.appendChild(deleteButton);
    cell.appendChild(actions);
    return cell;
  }

  function createDraftInputCell(product, field) {
    var cell = document.createElement("td");
    cell.className = "number-cell";
    var input = document.createElement("input");
    input.className = "movement-input";
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.inputMode = "numeric";
    input.value = getMovementDraft(product.id)[field] || "";
    input.dataset.productId = product.id;
    input.dataset.field = field;
    input.addEventListener("input", function () {
      updateMovementDraft(product.id, field, input.value);
    });
    input.addEventListener("keydown", function (event) {
      handleDraftInputKeydown(event, input);
    });
    cell.appendChild(input);
    return cell;
  }

  function handleDraftInputKeydown(event, input) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    var inputs = Array.prototype.slice.call(
      document.querySelectorAll(".movement-input[data-field='" + input.dataset.field + "']")
    );
    var currentIndex = inputs.indexOf(input);
    var nextIndex = event.key === "ArrowUp" ? currentIndex - 1 : currentIndex + 1;

    if (nextIndex < 0 || nextIndex >= inputs.length) {
      return;
    }

    event.preventDefault();
    inputs[nextIndex].focus();
    inputs[nextIndex].select();
  }

  function createCell(value, className) {
    var cell = document.createElement("td");
    cell.textContent = value === undefined || value === null || value === "" ? "-" : String(value);
    if (className) {
      cell.className = className;
    }
    return cell;
  }

  function getEmptyRow(colspan) {
    var row = document.getElementById("emptyRowTemplate").content.firstElementChild.cloneNode(true);
    row.firstElementChild.colSpan = colspan;
    return row;
  }

  function formatCartonRemainder(product) {
    var quantity = toInteger(product.quantity, 0);
    var cartonSize = Math.max(1, toInteger(product.cartonSize, 1));
    var cartons = Math.floor(quantity / cartonSize);
    var remainder = quantity % cartonSize;
    return cartons + "箱 / 余り" + remainder;
  }

  function normalizeProduct(product) {
    return {
      id: product.id || createId("product"),
      productCode: String(product.productCode || "").trim(),
      name: String(product.name || "").trim(),
      size: String(product.size || "").trim(),
      color: String(product.color || "").trim(),
      quantity: Math.max(0, toInteger(product.quantity, 0)),
      cartonSize: Math.max(1, toInteger(product.cartonSize, 1)),
      createdAt: product.createdAt || new Date().toISOString(),
      updatedAt: product.updatedAt || new Date().toISOString()
    };
  }

  function normalizeMovement(movement) {
    return {
      id: movement.id || createId("movement"),
      productId: movement.productId || "",
      type: movement.type === "out" ? "out" : "in",
      productCode: String(movement.productCode || "").trim(),
      productName: String(movement.productName || "").trim(),
      productColor: String(movement.productColor || "").trim(),
      productSize: String(movement.productSize || "").trim(),
      quantity: Math.max(0, toInteger(movement.quantity, 0)),
      cartons: Math.max(0, toInteger(movement.cartons, 0)),
      cartonSizeAtTime: Math.max(1, toInteger(movement.cartonSizeAtTime, 1)),
      memo: String(movement.memo || "").trim(),
      createdAt: movement.createdAt || new Date().toISOString()
    };
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function toInteger(value, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.trunc(number);
  }

  function createId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return prefix + "-" + window.crypto.randomUUID();
    }
    return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function formatDateTime(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatDateForFile(date) {
    var yyyy = date.getFullYear();
    var mm = String(date.getMonth() + 1).padStart(2, "0");
    var dd = String(date.getDate()).padStart(2, "0");
    var hh = String(date.getHours()).padStart(2, "0");
    var mi = String(date.getMinutes()).padStart(2, "0");
    return yyyy + mm + dd + "-" + hh + mi;
  }
})();
