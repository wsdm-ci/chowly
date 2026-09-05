const express = require("express");
const cors = require("cors");
const pool = require("./db");

require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/api/health", (req, res) => {
  res.json({
    message: "Chowly API is running",
  });
});

// ======================================================
// RESTAURANT
// ======================================================

app.get("/api/restaurant", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        restaurant_id,
        name,
        address,
        phone
      FROM restaurant
      WHERE restaurant_id = 1;
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Restaurant not found",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(
      "Error fetching restaurant:",
      error.message
    );

    res.status(500).json({
      error: "Failed to fetch restaurant",
    });
  }
});

// ======================================================
// MENU
// ======================================================

app.get("/api/menu", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        mi.menu_item_id,
        mi.name,
        mi.item_type,
        mi.price,
        mi.preparation_time
      FROM menu_item mi
      INNER JOIN menu m
        ON mi.menu_id = m.menu_id
      WHERE m.restaurant_id = 1
      ORDER BY mi.menu_item_id;
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(
      "Error fetching menu:",
      error.message
    );

    res.status(500).json({
      error: "Failed to fetch menu",
    });
  }
});

// ======================================================
// STAFF
// ======================================================

app.get("/api/staff", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        s.staff_id,
        s.name,
        s.phone,
        s.staff_role_id,
        sr.role_name
      FROM staff s
      INNER JOIN staff_role sr
        ON s.staff_role_id = sr.staff_role_id
      WHERE s.restaurant_id = 1
      ORDER BY sr.role_name, s.name;
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(
      "Error fetching staff:",
      error.message
    );

    res.status(500).json({
      error: "Failed to fetch staff",
    });
  }
});

// ======================================================
// CREATE ORDER
// ======================================================

app.post("/api/orders", async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      customer_name,
      customer_phone,
      customer_email,
      items,
    } = req.body;

    if (
      !customer_name ||
      !customer_name.trim() ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        error:
          "customer_name and at least one item are required",
      });
    }

    await client.query("BEGIN");

    const restaurantResult = await client.query(
      `
      SELECT restaurant_id
      FROM restaurant
      WHERE restaurant_id = 1;
      `
    );

    if (restaurantResult.rows.length === 0) {
      throw new Error("Restaurant not found");
    }

    const restaurantId =
      restaurantResult.rows[0].restaurant_id;

    // --------------------------------------------------
    // FIND EXISTING CUSTOMER OR CREATE NEW CUSTOMER
    // --------------------------------------------------

    let customerResult = await client.query(
      `
      SELECT
        customer_id,
        restaurant_id,
        name,
        phone,
        email
      FROM customer
      WHERE restaurant_id = $1
        AND LOWER(name) = LOWER($2)
        AND COALESCE(phone, '') = COALESCE($3, '')
        AND COALESCE(email, '') = COALESCE($4, '')
      LIMIT 1;
      `,
      [
        restaurantId,
        customer_name.trim(),
        customer_phone?.trim() || null,
        customer_email?.trim() || null,
      ]
    );

    if (customerResult.rows.length === 0) {
      customerResult = await client.query(
        `
        INSERT INTO customer (
          restaurant_id,
          name,
          phone,
          email
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
          customer_id,
          restaurant_id,
          name,
          phone,
          email;
        `,
        [
          restaurantId,
          customer_name.trim(),
          customer_phone?.trim() || null,
          customer_email?.trim() || null,
        ]
      );
    }

    const customer = customerResult.rows[0];

    // --------------------------------------------------
    // CREATE ORDER
    // --------------------------------------------------

    const orderResult = await client.query(
      `
      INSERT INTO orders (
        customer_id,
        restaurant_id,
        status
      )
      VALUES ($1, $2, 'Pending')
      RETURNING
        order_id,
        customer_id,
        restaurant_id,
        order_time,
        status;
      `,
      [
        customer.customer_id,
        restaurantId,
      ]
    );

    const order = orderResult.rows[0];

    // --------------------------------------------------
    // ADD ORDER ITEMS
    // --------------------------------------------------

    for (const item of items) {
      if (
        !item.menu_item_id ||
        !item.quantity ||
        Number(item.quantity) < 1
      ) {
        throw new Error(
          "Each item must have a valid menu_item_id and quantity"
        );
      }

      const menuItemResult = await client.query(
        `
        SELECT
          menu_item_id,
          price
        FROM menu_item
        WHERE menu_item_id = $1;
        `,
        [item.menu_item_id]
      );

      if (menuItemResult.rows.length === 0) {
        throw new Error(
          `Menu item ${item.menu_item_id} not found`
        );
      }

      const menuItem =
        menuItemResult.rows[0];

      await client.query(
        `
        INSERT INTO order_item (
          order_id,
          menu_item_id,
          quantity,
          unit_price
        )
        VALUES ($1, $2, $3, $4);
        `,
        [
          order.order_id,
          item.menu_item_id,
          item.quantity,
          menuItem.price,
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Order created successfully",
      ...order,
      customer,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "Error creating order:",
      error.message
    );

    res.status(500).json({
      error: "Failed to create order",
    });
  } finally {
    client.release();
  }
});

// ======================================================
// GET ALL ORDERS
// Used by the waiter section
// ======================================================

app.get("/api/orders", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        o.order_id,
        o.customer_id,
        c.name AS customer_name,
        o.order_time,
        o.status,
        COALESCE(
          SUM(oi.quantity * oi.unit_price),
          0
        ) AS total,
        COALESCE(
          MAX(mi.preparation_time),
          0
        ) AS estimated_waiting_time,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM payment p
            WHERE p.order_id = o.order_id
              AND p.payment_status = 'Paid'
          )
          THEN 'Paid'
          ELSE 'Unpaid'
        END AS payment_status
      FROM orders o
      INNER JOIN customer c
        ON c.customer_id = o.customer_id
      LEFT JOIN order_item oi
        ON o.order_id = oi.order_id
      LEFT JOIN menu_item mi
        ON oi.menu_item_id = mi.menu_item_id
      WHERE o.restaurant_id = 1
      GROUP BY
        o.order_id,
        o.customer_id,
        c.name,
        o.order_time,
        o.status
      ORDER BY o.order_id DESC;
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(
      "Error fetching orders:",
      error.message
    );

    res.status(500).json({
      error: "Failed to fetch orders",
    });
  }
});

// ======================================================
// GET CUSTOMER ORDER HISTORY
// Used by "My Orders"
// ======================================================

app.get(
  "/api/customers/:customerId/orders",
  async (req, res) => {
    const customerId = req.params.customerId;

    try {
      const result = await pool.query(
        `
        SELECT
          o.order_id,
          o.customer_id,
          c.name AS customer_name,
          o.order_time,
          o.status,

          COALESCE(
            SUM(oi.quantity * oi.unit_price),
            0
          ) AS total,

          COALESCE(
            MAX(mi.preparation_time),
            0
          ) AS estimated_waiting_time,

          CASE
            WHEN EXISTS (
              SELECT 1
              FROM payment p
              WHERE p.order_id = o.order_id
                AND p.payment_status = 'Paid'
            )
            THEN 'Paid'
            ELSE 'Unpaid'
          END AS payment_status

        FROM orders o

        INNER JOIN customer c
          ON c.customer_id = o.customer_id

        LEFT JOIN order_item oi
          ON o.order_id = oi.order_id

        LEFT JOIN menu_item mi
          ON oi.menu_item_id = mi.menu_item_id

        WHERE o.customer_id = $1

        GROUP BY
          o.order_id,
          o.customer_id,
          c.name,
          o.order_time,
          o.status

        ORDER BY o.order_id DESC;
        `,
        [customerId]
      );

      res.json(result.rows);
    } catch (error) {
      console.error(
        "Error fetching customer orders:",
        error.message
      );

      res.status(500).json({
        error:
          "Failed to fetch customer orders",
      });
    }
  }
);

// ======================================================
// GET ORDER DETAILS
// ======================================================

app.get("/api/orders/:id", async (req, res) => {
  const orderId = req.params.id;

  try {
    const orderResult = await pool.query(
      `
      SELECT
        o.order_id,
        o.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.email AS customer_email,
        o.restaurant_id,
        o.order_time,
        o.status,
        o.served_at
      FROM orders o
      INNER JOIN customer c
        ON c.customer_id = o.customer_id
      WHERE o.order_id = $1;
      `,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    const order = orderResult.rows[0];

    // --------------------------------------------------
    // ORDER ITEMS
    // --------------------------------------------------

    const itemsResult = await pool.query(
      `
      SELECT
        oi.order_item_id,
        oi.menu_item_id,
        mi.name,
        mi.item_type,
        oi.quantity,
        oi.unit_price,
        (oi.quantity * oi.unit_price) AS subtotal,
        mi.preparation_time
      FROM order_item oi
      INNER JOIN menu_item mi
        ON oi.menu_item_id = mi.menu_item_id
      WHERE oi.order_id = $1
      ORDER BY oi.order_item_id;
      `,
      [orderId]
    );

    // --------------------------------------------------
    // ORDER TOTAL
    // --------------------------------------------------

    const totalResult = await pool.query(
      `
      SELECT
        COALESCE(
          SUM(quantity * unit_price),
          0
        ) AS total
      FROM order_item
      WHERE order_id = $1;
      `,
      [orderId]
    );

    // --------------------------------------------------
    // ESTIMATED WAITING TIME
    // --------------------------------------------------

    const waitingResult = await pool.query(
      `
      SELECT
        COALESCE(
          MAX(mi.preparation_time),
          0
        ) AS estimated_waiting_time
      FROM order_item oi
      INNER JOIN menu_item mi
        ON oi.menu_item_id = mi.menu_item_id
      WHERE oi.order_id = $1;
      `,
      [orderId]
    );

    // --------------------------------------------------
    // PAYMENT
    // --------------------------------------------------

    const paymentResult = await pool.query(
      `
      SELECT
        payment_id,
        amount,
        payment_status,
        payment_method,
        paid_at
      FROM payment
      WHERE order_id = $1
      ORDER BY payment_id DESC
      LIMIT 1;
      `,
      [orderId]
    );

    const payment =
      paymentResult.rows.length > 0
        ? paymentResult.rows[0]
        : null;

    // --------------------------------------------------
    // STAFF ASSIGNMENT
    // --------------------------------------------------

    const assignmentResult = await pool.query(
      `
      SELECT
        oa.order_assignment_id,
        oa.order_id,

        oa.waiter_id,
        waiter.name AS waiter_name,

        chef.staff_id AS chef_id,
        chef.name AS chef_name,

        bartender.staff_id AS bartender_id,
        bartender.name AS bartender_name

      FROM order_assignment oa

      INNER JOIN staff waiter
        ON oa.waiter_id = waiter.staff_id

      LEFT JOIN order_item oi
        ON oi.order_id = oa.order_id

      LEFT JOIN order_preparation chef_prep
        ON chef_prep.order_item_id = oi.order_item_id
       AND chef_prep.preparation_role = 'Chef'

      LEFT JOIN staff chef
        ON chef.staff_id = chef_prep.staff_id

      LEFT JOIN order_preparation bartender_prep
        ON bartender_prep.order_item_id = oi.order_item_id
       AND bartender_prep.preparation_role = 'Bartender'

      LEFT JOIN staff bartender
        ON bartender.staff_id = bartender_prep.staff_id

      WHERE oa.order_id = $1

      ORDER BY oi.order_item_id

      LIMIT 1;
      `,
      [orderId]
    );

    const assignment =
      assignmentResult.rows.length > 0
        ? assignmentResult.rows[0]
        : null;

    // --------------------------------------------------
    // COMPLAINT
    // --------------------------------------------------

    const complaintResult = await pool.query(
      `
      SELECT
        complaint_id,
        order_id,
        customer_id,
        complaint_text,
        created_at
      FROM complaint
      WHERE order_id = $1
      ORDER BY complaint_id DESC
      LIMIT 1;
      `,
      [orderId]
    );

    const complaint =
      complaintResult.rows.length > 0
        ? complaintResult.rows[0]
        : null;

    // --------------------------------------------------
    // RATING
    // --------------------------------------------------

    const ratingResult = await pool.query(
      `
      SELECT
        rating_id,
        order_id,
        customer_id,
        rating,
        created_at
      FROM rating
      WHERE order_id = $1
      ORDER BY rating_id DESC
      LIMIT 1;
      `,
      [orderId]
    );

    const rating =
      ratingResult.rows.length > 0
        ? ratingResult.rows[0]
        : null;

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    res.json({
      ...order,

      items: itemsResult.rows,

      total: Number(
        totalResult.rows[0].total
      ),

      estimated_waiting_time: Number(
        waitingResult.rows[0]
          .estimated_waiting_time
      ),

      payment_status:
        payment?.payment_status || "Unpaid",

      payment,

      assignment,

      complaint,

      rating,
    });
  } catch (error) {
    console.error(
      "Error fetching order details:",
      error.message
    );

    res.status(500).json({
      error: "Failed to fetch order details",
    });
  }
});

// ======================================================
// ASSIGN / REASSIGN WAITER, CHEF AND BARTENDER
// ======================================================

app.post(
  "/api/orders/:id/assign",
  async (req, res) => {
    const orderId = req.params.id;

    const {
      waiter_id,
      chef_id,
      bartender_id,
    } = req.body;

    const client = await pool.connect();

    try {
      if (
        !waiter_id ||
        !chef_id ||
        !bartender_id
      ) {
        return res.status(400).json({
          error:
            "waiter_id, chef_id and bartender_id are required",
        });
      }

      await client.query("BEGIN");

      // --------------------------------------------------
      // CHECK ORDER
      // --------------------------------------------------

      const orderCheck =
        await client.query(
          `
          SELECT order_id
          FROM orders
          WHERE order_id = $1;
          `,
          [orderId]
        );

      if (orderCheck.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Order not found",
        });
      }

      // --------------------------------------------------
      // CHECK WAITER
      // --------------------------------------------------

      const waiterCheck =
        await client.query(
          `
          SELECT
            s.staff_id
          FROM staff s
          INNER JOIN staff_role sr
            ON s.staff_role_id = sr.staff_role_id
          WHERE s.staff_id = $1
            AND s.restaurant_id = 1
            AND sr.role_name = 'Waiter';
          `,
          [waiter_id]
        );

      // --------------------------------------------------
      // CHECK CHEF
      // --------------------------------------------------

      const chefCheck =
        await client.query(
          `
          SELECT
            s.staff_id
          FROM staff s
          INNER JOIN staff_role sr
            ON s.staff_role_id = sr.staff_role_id
          WHERE s.staff_id = $1
            AND s.restaurant_id = 1
            AND sr.role_name = 'Chef';
          `,
          [chef_id]
        );

      // --------------------------------------------------
      // CHECK BARTENDER
      // --------------------------------------------------

      const bartenderCheck =
        await client.query(
          `
          SELECT
            s.staff_id
          FROM staff s
          INNER JOIN staff_role sr
            ON s.staff_role_id = sr.staff_role_id
          WHERE s.staff_id = $1
            AND s.restaurant_id = 1
            AND sr.role_name = 'Bartender';
          `,
          [bartender_id]
        );

      if (waiterCheck.rows.length === 0) {
        throw new Error(
          "Selected waiter was not found"
        );
      }

      if (chefCheck.rows.length === 0) {
        throw new Error(
          "Selected chef was not found"
        );
      }

      if (bartenderCheck.rows.length === 0) {
        throw new Error(
          "Selected bartender was not found"
        );
      }

      // --------------------------------------------------
      // ASSIGN / REASSIGN WAITER
      // --------------------------------------------------

      const existingAssignment =
        await client.query(
          `
          SELECT
            order_assignment_id
          FROM order_assignment
          WHERE order_id = $1;
          `,
          [orderId]
        );

      let assignmentResult;

      if (existingAssignment.rows.length > 0) {
        assignmentResult =
          await client.query(
            `
            UPDATE order_assignment
            SET waiter_id = $1
            WHERE order_id = $2
            RETURNING
              order_assignment_id,
              order_id,
              waiter_id,
              assigned_at;
            `,
            [waiter_id, orderId]
          );
      } else {
        assignmentResult =
          await client.query(
            `
            INSERT INTO order_assignment (
              order_id,
              waiter_id
            )
            VALUES ($1, $2)
            RETURNING
              order_assignment_id,
              order_id,
              waiter_id,
              assigned_at;
            `,
            [orderId, waiter_id]
          );
      }

      // --------------------------------------------------
      // GET ORDER ITEMS
      // --------------------------------------------------

      const orderItemsResult =
        await client.query(
          `
          SELECT
            order_item_id
          FROM order_item
          WHERE order_id = $1
          ORDER BY order_item_id;
          `,
          [orderId]
        );

      // --------------------------------------------------
      // ASSIGN / REASSIGN CHEF AND BARTENDER
      // --------------------------------------------------

      for (const item of orderItemsResult.rows) {
        await client.query(
          `
          DELETE FROM order_preparation
          WHERE order_item_id = $1;
          `,
          [item.order_item_id]
        );

        await client.query(
          `
          INSERT INTO order_preparation (
            order_item_id,
            staff_id,
            preparation_role
          )
          VALUES
            ($1, $2, 'Chef'),
            ($1, $3, 'Bartender');
          `,
          [
            item.order_item_id,
            chef_id,
            bartender_id,
          ]
        );
      }

      await client.query("COMMIT");

      res.json({
        message:
          "Order staff assigned successfully",

        assignment:
          assignmentResult.rows[0],

        chef_id: Number(chef_id),

        bartender_id:
          Number(bartender_id),

        prepared_items:
          orderItemsResult.rows.length,
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error(
        "Error assigning staff:",
        error.message
      );

      res.status(500).json({
        error:
          "Failed to assign order staff",
      });
    } finally {
      client.release();
    }
  }
);

// ======================================================
// MARK ORDER AS SERVED
// ======================================================

app.patch(
  "/api/orders/:id/serve",
  async (req, res) => {
    const orderId = req.params.id;

    try {
      const result = await pool.query(
        `
        UPDATE orders
        SET
          status = 'Served',
          served_at = CURRENT_TIMESTAMP
        WHERE order_id = $1
        RETURNING
          order_id,
          status,
          served_at;
        `,
        [orderId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Order not found",
        });
      }

      res.json({
        message: "Order marked as served",
        ...result.rows[0],
      });
    } catch (error) {
      console.error(
        "Error serving order:",
        error.message
      );

      res.status(500).json({
        error:
          "Failed to mark order as served",
      });
    }
  }
);

// ======================================================
// COMPLAINT
// ======================================================

app.post(
  "/api/orders/:id/complaint",
  async (req, res) => {
    const orderId = req.params.id;

    const {
      customer_id,
      complaint_text,
    } = req.body;

    try {
      if (
        !customer_id ||
        !complaint_text
      ) {
        return res.status(400).json({
          error:
            "customer_id and complaint_text are required",
        });
      }

      const result = await pool.query(
        `
        INSERT INTO complaint (
          order_id,
          customer_id,
          complaint_text
        )
        VALUES ($1, $2, $3)
        RETURNING
          complaint_id,
          order_id,
          customer_id,
          complaint_text,
          created_at;
        `,
        [
          orderId,
          customer_id,
          complaint_text,
        ]
      );

      res.status(201).json({
        message:
          "Complaint submitted successfully",
        complaint: result.rows[0],
      });
    } catch (error) {
      console.error(
        "Error submitting complaint:",
        error.message
      );

      res.status(500).json({
        error:
          "Failed to submit complaint",
      });
    }
  }
);

// ======================================================
// RATING
// ======================================================

app.post(
  "/api/orders/:id/rating",
  async (req, res) => {
    const orderId = req.params.id;

    const {
      customer_id,
      rating,
    } = req.body;

    try {
      if (
        !customer_id ||
        !rating
      ) {
        return res.status(400).json({
          error:
            "customer_id and rating are required",
        });
      }

      if (
        Number(rating) < 1 ||
        Number(rating) > 5
      ) {
        return res.status(400).json({
          error:
            "Rating must be between 1 and 5",
        });
      }

      const result = await pool.query(
        `
        INSERT INTO rating (
          order_id,
          customer_id,
          rating
        )
        VALUES ($1, $2, $3)
        RETURNING
          rating_id,
          order_id,
          customer_id,
          rating,
          created_at;
        `,
        [
          orderId,
          customer_id,
          rating,
        ]
      );

      res.status(201).json({
        message:
          "Rating submitted successfully",
        rating: result.rows[0],
      });
    } catch (error) {
      console.error(
        "Error submitting rating:",
        error.message
      );

      res.status(500).json({
        error: "Failed to submit rating",
      });
    }
  }
);

// ======================================================
// PRETEND PAYMENT
// IMPORTANT:
// Payment does NOT change the order status.
// Order status remains Pending/Served.
// ======================================================

app.post(
  "/api/orders/:id/payment",
  async (req, res) => {
    const orderId = req.params.id;

    const {
      payment_method = "Card",
    } = req.body;

    try {
      const totalResult = await pool.query(
        `
        SELECT
          COALESCE(
            SUM(quantity * unit_price),
            0
          ) AS total
        FROM order_item
        WHERE order_id = $1;
        `,
        [orderId]
      );

      const amount = Number(
        totalResult.rows[0].total
      );

      if (amount <= 0) {
        return res.status(400).json({
          error:
            "Order total must be greater than zero",
        });
      }

      const orderCheck =
        await pool.query(
          `
          SELECT
            order_id,
            status
          FROM orders
          WHERE order_id = $1;
          `,
          [orderId]
        );

      if (orderCheck.rows.length === 0) {
        return res.status(404).json({
          error: "Order not found",
        });
      }

      // Payment is intended to happen just before exit,
      // so only Served orders can be paid.
      if (
        orderCheck.rows[0].status !== "Served"
      ) {
        return res.status(400).json({
          error:
            "Order must be served before payment",
        });
      }

      const existingPayment =
        await pool.query(
          `
          SELECT
            payment_id
          FROM payment
          WHERE order_id = $1
            AND payment_status = 'Paid'
          LIMIT 1;
          `,
          [orderId]
        );

      if (existingPayment.rows.length > 0) {
        return res.status(400).json({
          error:
            "This order has already been paid",
        });
      }

      const result = await pool.query(
        `
        INSERT INTO payment (
          order_id,
          amount,
          payment_status,
          payment_method,
          paid_at
        )
        VALUES (
          $1,
          $2,
          'Paid',
          $3,
          CURRENT_TIMESTAMP
        )
        RETURNING
          payment_id,
          order_id,
          amount,
          payment_status,
          payment_method,
          paid_at;
        `,
        [
          orderId,
          amount,
          payment_method,
        ]
      );

      res.json({
        message:
          "Pretend payment successful",

        payment:
          result.rows[0],

        notice:
          "This is a pretend payment for demonstration purposes.",
      });
    } catch (error) {
      console.error(
        "Error processing payment:",
        error.message
      );

      res.status(500).json({
        error:
          "Failed to process payment",
      });
    }
  }
);

// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Chowly server running on http://0.0.0.0:${PORT}`);
});