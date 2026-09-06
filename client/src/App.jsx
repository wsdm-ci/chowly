import { useCallback, useEffect, useState } from "react";
import "./index.css";

const API_URL = `${import.meta.env.VITE_API_URL || "http://localhost:5001"}/api`;

function App() {
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("customer");

  // CUSTOMER
  const [cart, setCart] = useState([]);
  const [showReview, setShowReview] = useState(false);
  const [order, setOrder] = useState(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // CUSTOMER DETAILS
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  // CUSTOMER HISTORY
  const [customerId, setCustomerId] = useState(() => {
    const saved = localStorage.getItem("chowlyCustomerId");
    return saved ? Number(saved) : null;
  });

  const [customerPage, setCustomerPage] = useState("menu");
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerOrdersLoading, setCustomerOrdersLoading] = useState(false);
  const [customerOrdersError, setCustomerOrdersError] = useState("");

  // CUSTOMER - FEEDBACK + PAYMENT
  const [complaintText, setComplaintText] = useState("");
  const [ratingValue, setRatingValue] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [payingOrder, setPayingOrder] = useState(false);

  // WAITER
  const [orders, setOrders] = useState([]);
  const [staff, setStaff] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [selectedStaff, setSelectedStaff] = useState({
    waiter_id: "",
    chef_id: "",
    bartender_id: "",
  });

  const [waiterLoading, setWaiterLoading] = useState(false);
  const [waiterError, setWaiterError] = useState("");
  const [reassigningStaff, setReassigningStaff] = useState(false);

  // --------------------------------------------------
  // LOAD RESTAURANT + MENU
  // --------------------------------------------------

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [restaurantResponse, menuResponse] = await Promise.all([
          fetch(`${API_URL}/restaurant`),
          fetch(`${API_URL}/menu`),
        ]);

        if (!restaurantResponse.ok || !menuResponse.ok) {
          throw new Error("Unable to load restaurant data.");
        }

        const restaurantData = await restaurantResponse.json();
        const menuData = await menuResponse.json();

        setRestaurant(restaurantData);
        setMenu(menuData);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  // --------------------------------------------------
  // WAITER DATA
  // --------------------------------------------------

  const loadWaiterData = useCallback(async () => {
    setWaiterLoading(true);
    setWaiterError("");

    try {
      const [ordersResponse, staffResponse] = await Promise.all([
        fetch(`${API_URL}/orders`),
        fetch(`${API_URL}/staff`),
      ]);

      if (!ordersResponse.ok || !staffResponse.ok) {
        throw new Error("Unable to load waiter data.");
      }

      const ordersData = await ordersResponse.json();
      const staffData = await staffResponse.json();

      setOrders(ordersData);
      setStaff(staffData);
    } catch (error) {
      console.error(error);
      setWaiterError(error.message);
    } finally {
      setWaiterLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "waiter") {
      loadWaiterData();
    }
  }, [mode, loadWaiterData]);

  // --------------------------------------------------
  // CUSTOMER ORDERS
  // --------------------------------------------------

  const loadCustomerOrders = useCallback(
    async (customerIdOverride = null) => {
      const activeCustomerId = customerIdOverride || customerId;

      if (!activeCustomerId) {
        setCustomerOrders([]);
        return;
      }

      setCustomerOrdersLoading(true);
      setCustomerOrdersError("");

      try {
        const response = await fetch(
          `${API_URL}/customers/${activeCustomerId}/orders`,
        );

        if (!response.ok) {
          throw new Error("Unable to load your orders.");
        }

        const data = await response.json();
        setCustomerOrders(data);
      } catch (error) {
        console.error(error);
        setCustomerOrdersError(error.message);
      } finally {
        setCustomerOrdersLoading(false);
      }
    },
    [customerId],
  );

  const openCustomerOrders = async () => {
    setPaymentSuccess(false);
    setCustomerPage("orders");
    setOrder(null);
    setShowReview(false);
    await loadCustomerOrders();
  };

  // --------------------------------------------------
  // CUSTOMER - CART
  // --------------------------------------------------

  const addToCart = (item) => {
    setCart((currentCart) => {
      const existingItem = currentCart.find(
        (cartItem) => cartItem.menu_item_id === item.menu_item_id,
      );

      if (existingItem) {
        return currentCart.map((cartItem) =>
          cartItem.menu_item_id === item.menu_item_id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem,
        );
      }

      return [...currentCart, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (menuItemId) => {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.menu_item_id === menuItemId
            ? { ...item, quantity: item.quantity - 1 }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const cartTotal = cart.reduce(
    (total, item) => total + Number(item.price) * item.quantity,
    0,
  );

  const cartWaitingTime = cart.reduce(
    (total, item) => total + Number(item.preparation_time),
    0,
  );

  // --------------------------------------------------
  // CUSTOMER - PLACE ORDER
  // --------------------------------------------------

  const openReview = () => {
    if (cart.length === 0) {
      alert("Please add at least one item to your order.");
      return;
    }

    setShowReview(true);
    setCustomerPage("menu");
    setPaymentSuccess(false);
  };

  const placeOrder = async () => {
    if (!customerName.trim()) {
      alert("Please enter your name.");
      return;
    }

    if (!customerPhone.trim()) {
      alert("Please enter your phone number.");
      return;
    }

    if (cart.length === 0) {
      alert("Your cart is empty.");
      return;
    }

    setPlacingOrder(true);

    try {
      const response = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_email: customerEmail.trim(),
          items: cart.map((item) => ({
            menu_item_id: item.menu_item_id,
            quantity: item.quantity,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to place order.");
      }

      const newCustomerId = data.customer.customer_id;

      const newOrderId = data.order?.order_id || data.order_id;

      if (!newOrderId) {
        throw new Error(
          "Order was created, but the order number could not be retrieved.",
        );
      }

      setCustomerId(newCustomerId);

      localStorage.setItem(
        "chowlyCustomerId",
        String(newCustomerId),
      );

      // Fetch the complete order details
      const orderResponse = await fetch(
        `${API_URL}/orders/${newOrderId}`,
      );

      if (!orderResponse.ok) {
        throw new Error(
          "Order was created, but the confirmation details could not be loaded.",
        );
      }

      const completeOrder = await orderResponse.json();

      // Display the order confirmation page
      setOrder(completeOrder);
      setCart([]);
      setShowReview(false);
      setCustomerPage("order");
      setPaymentSuccess(false);

      // Reset feedback fields
      setComplaintText("");
      setRatingValue(0);
      setFeedbackMessage("");

      // Refresh customer order history
      await loadCustomerOrders(newCustomerId);
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setPlacingOrder(false);
    }
  };

  // --------------------------------------------------
  // CUSTOMER - OPEN ORDER
  // --------------------------------------------------

  const openCustomerOrder = async (orderId) => {
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}`);

      if (!response.ok) {
        throw new Error("Unable to load order details.");
      }

      const data = await response.json();

      setOrder(data);
      setCustomerPage("order");
      setShowReview(false);
      setPaymentSuccess(false);

      setComplaintText("");
      setRatingValue(0);
      setFeedbackMessage("");
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  };

  // --------------------------------------------------
  // CUSTOMER - FEEDBACK
  // --------------------------------------------------

  const submitFeedback = async () => {
    if (!order) return;

    if (!order.rating && (!ratingValue || ratingValue < 1)) {
      alert("Please select a rating from 1 to 5.");
      return;
    }

    if (order.status !== "Served") {
      alert("Feedback can only be submitted after the order has been served.");
      return;
    }

    setSubmittingFeedback(true);
    setFeedbackMessage("");

    try {
      let submittedSomething = false;

      if (!order.rating) {
        const ratingResponse = await fetch(
          `${API_URL}/orders/${order.order_id}/rating`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              customer_id: order.customer_id,
              rating: Number(ratingValue),
            }),
          },
        );

        const ratingData = await ratingResponse.json();

        if (!ratingResponse.ok) {
          throw new Error(
            ratingData.error || "Unable to submit rating.",
          );
        }

        submittedSomething = true;
      }

      if (!order.complaint && complaintText.trim()) {
        const complaintResponse = await fetch(
          `${API_URL}/orders/${order.order_id}/complaint`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              customer_id: order.customer_id,
              complaint_text: complaintText.trim(),
            }),
          },
        );

        const complaintData = await complaintResponse.json();

        if (!complaintResponse.ok) {
          throw new Error(
            complaintData.error || "Unable to submit complaint.",
          );
        }

        submittedSomething = true;
      }

      if (!submittedSomething) {
        setFeedbackMessage("Your feedback has already been recorded.");
        return;
      }

      setFeedbackMessage("Thank you. Your feedback has been recorded.");

      await openCustomerOrder(order.order_id);
      await loadCustomerOrders();
    } catch (error) {
      console.error(error);
      setFeedbackMessage(error.message);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // --------------------------------------------------
  // CUSTOMER - PRETEND PAYMENT
  // --------------------------------------------------

  const payForOrder = async () => {
    if (!order) return;

    if (order.status !== "Served") {
      alert("Payment is available after the order has been served.");
      return;
    }

    if (order.payment) {
      return;
    }

    const confirmed = window.confirm(
      `This is a PRETEND PAYMENT for ₦${Number(
        order.total,
      ).toLocaleString()}. Continue?`,
    );

    if (!confirmed) return;

    setPayingOrder(true);

    try {
      // Record the pretend payment
      const response = await fetch(
        `${API_URL}/orders/${order.order_id}/payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customer_id: order.customer_id,
            payment_method: "Card",
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to record payment.",
        );
      }

      // Get the complete updated order from the server
      const paidOrderId =
        data.order?.order_id || order.order_id;

      const orderResponse = await fetch(
        `${API_URL}/orders/${paidOrderId}`,
      );

      if (!orderResponse.ok) {
        throw new Error(
          "Payment was recorded, but the updated order could not be loaded.",
        );
      }

      const completePaidOrder =
        await orderResponse.json();

      // Store the complete paid order
      setOrder(completePaidOrder);

      // Show payment success screen
      setPaymentSuccess(true);

      // Refresh customer order history
      await loadCustomerOrders();
    } catch (error) {
      console.error("Payment error:", error);
      alert(error.message);
    } finally {
      setPayingOrder(false);
    }
  };

  // --------------------------------------------------
  // WAITER - OPEN ORDER
  // --------------------------------------------------

  const openOrder = async (orderId) => {
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}`);

      if (!response.ok) {
        throw new Error("Unable to load order details.");
      }

      const data = await response.json();

      setSelectedOrder(data);
      setReassigningStaff(false);

      setSelectedStaff({
        waiter_id: data.assignment?.waiter_id
          ? String(data.assignment.waiter_id)
          : "",
        chef_id: data.assignment?.chef_id
          ? String(data.assignment.chef_id)
          : "",
        bartender_id: data.assignment?.bartender_id
          ? String(data.assignment.bartender_id)
          : "",
      });
    } catch (error) {
      console.error(error);
      setWaiterError(error.message);
    }
  };

  // --------------------------------------------------
  // WAITER - ASSIGN / REASSIGN STAFF
  // --------------------------------------------------

  const assignStaff = async () => {
    if (!selectedOrder) return;

    if (
      !selectedStaff.waiter_id ||
      !selectedStaff.chef_id ||
      !selectedStaff.bartender_id
    ) {
      alert("Please select a waiter, chef, and bartender.");
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/orders/${selectedOrder.order_id}/assign`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            waiter_id: Number(selectedStaff.waiter_id),
            chef_id: Number(selectedStaff.chef_id),
            bartender_id: Number(selectedStaff.bartender_id),
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to assign staff.");
      }

      await openOrder(selectedOrder.order_id);
      await loadWaiterData();

      alert(
        selectedOrder.assignment
          ? "Staff reassigned successfully."
          : "Staff assigned successfully.",
      );
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  };

  // --------------------------------------------------
  // WAITER - DELETE ORDER
  // --------------------------------------------------

  const deleteOrder = async () => {
    if (!selectedOrder) return;

    const confirmed = window.confirm(
      `Delete Order #${selectedOrder.order_id}? This action cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `${API_URL}/orders/${selectedOrder.order_id}`,
        {
          method: "DELETE",
        },
      );

      const contentType =
        response.headers.get("content-type") || "";

      const data = contentType.includes("application/json")
        ? await response.json()
        : {
            error: await response.text(),
          };

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to delete order.",
        );
      }

      setSelectedOrder(null);
      setReassigningStaff(false);

      await loadWaiterData();

      alert("Order deleted successfully.");
    } catch (error) {
      console.error("Delete order error:", error);

      alert(
        error.message ||
          "Unable to delete order.",
      );
    }
  };

  // --------------------------------------------------
  // WAITER - MARK SERVED
  // --------------------------------------------------

  const markServed = async () => {
    if (!selectedOrder) return;

    const confirmed = window.confirm(
      `Mark Order #${selectedOrder.order_id} as served?`,
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `${API_URL}/orders/${selectedOrder.order_id}/serve`,
        {
          method: "PATCH",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to mark order as served.",
        );
      }

      await openOrder(selectedOrder.order_id);
      await loadWaiterData();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  };

  // --------------------------------------------------
  // STAFF HELPERS
  // --------------------------------------------------

  const getStaffByRole = (roleName) =>
    staff.filter(
      (person) =>
        person.role_name &&
        person.role_name.toLowerCase() === roleName.toLowerCase(),
    );

  // --------------------------------------------------
  // NAVIGATION
  // --------------------------------------------------

  const switchMode = (newMode) => {
    setMode(newMode);

    if (newMode === "waiter") {
      setSelectedOrder(null);
      setReassigningStaff(false);
    }
  };

  const backToMenu = () => {
    setCustomerPage("menu");
    setShowReview(false);
    setOrder(null);
    setPaymentSuccess(false);
    setFeedbackMessage("");
  };

  // --------------------------------------------------
  // LOADING
  // --------------------------------------------------

  if (loading) {
    return (
      <div className="app loading-screen">
        <div className="loading-card">
          <div className="loading-spinner"></div>
          <p>Loading Chowly...</p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // CUSTOMER MODE
  // --------------------------------------------------

  const renderCustomer = () => {
    // -----------------------------
    // PAYMENT SUCCESS
    // -----------------------------

    if (paymentSuccess && order) {
      return (
        <main className="order-page">
          <section className="payment-success-card">
            <div className="payment-success-icon">✓</div>

            <p className="eyebrow">Payment Complete</p>

            <h2>Payment Successful</h2>

            <p className="payment-success-message">
              Thank you for dining with us!
            </p>

            <div className="payment-success-details">
              <div>
                <span>Order Number</span>
                <strong>#{order.order_id}</strong>
              </div>

              <div>
                <span>Amount Paid</span>
                <strong>
                  ₦{Number(order.total).toLocaleString()}
                </strong>
              </div>

              <div>
                <span>Payment Method</span>
                <strong>
                  {order.payment?.payment_method || "Card"}
                </strong>
              </div>

              <div>
                <span>Payment Status</span>
                <strong>Paid</strong>
              </div>
            </div>

            <div className="restaurant-thank-you">
              <strong>
                Thank you for choosing The Garden Restaurant.
              </strong>

              <p>
                We appreciate your visit and hope you enjoyed your
                dining experience. We look forward to welcoming you
                again soon!
              </p>
            </div>

            <div className="payment-success-actions">
              <button
                className="primary-button"
                onClick={backToMenu}
              >
                Back to Menu
              </button>

              <button
                className="secondary-button"
                onClick={openCustomerOrders}
              >
                My Orders
              </button>
            </div>
          </section>
        </main>
      );
    }

    // -----------------------------
    // MY ORDERS
    // -----------------------------

    if (customerPage === "orders") {
      return (
        <main className="customer-orders-page">
          <div className="page-header-row">
            <div>
              <p className="eyebrow">Customer</p>

              <h2>My Orders</h2>

              <p className="section-subtitle">
                View your previous and current Chowly orders.
              </p>
            </div>

            <button
              className="secondary-button"
              onClick={backToMenu}
            >
              Back to Menu
            </button>
          </div>

          {customerOrdersLoading ? (
            <div className="empty-state">
              <p>Loading your orders...</p>
            </div>
          ) : customerOrdersError ? (
            <div className="error-card">
              <p>{customerOrdersError}</p>

              <button
                className="primary-button"
                onClick={loadCustomerOrders}
              >
                Try Again
              </button>
            </div>
          ) : !customerId ? (
            <div className="empty-state">
              <h3>No customer profile yet</h3>

              <p>
                Place your first order and your order history will
                appear here.
              </p>

              <button
                className="primary-button"
                onClick={backToMenu}
              >
                Browse Menu
              </button>
            </div>
          ) : customerOrders.length === 0 ? (
            <div className="empty-state">
              <h3>No orders yet</h3>

              <p>
                Your Chowly orders will appear here after you place one.
              </p>

              <button
                className="primary-button"
                onClick={backToMenu}
              >
                Browse Menu
              </button>
            </div>
          ) : (
            <div className="customer-orders-list">
              {customerOrders.map((customerOrder) => (
                <button
                  key={customerOrder.order_id}
                  className="customer-order-card"
                  onClick={() =>
                    openCustomerOrder(customerOrder.order_id)
                  }
                >
                  <div className="customer-order-card-top">
                    <div>
                      <span className="order-number">
                        Order #{customerOrder.order_id}
                      </span>

                      <span
                        className={`status-badge status-${String(
                          customerOrder.status,
                        ).toLowerCase()}`}
                      >
                        {customerOrder.status}
                      </span>
                    </div>

                    <strong>
                      ₦{Number(customerOrder.total).toLocaleString()}
                    </strong>
                  </div>

                  <div className="customer-order-card-bottom">
                    <span>
                      {customerOrder.estimated_waiting_time} min
                      estimated wait
                    </span>

                    <span>
                      {customerOrder.payment_status === "Paid"
                        ? "Paid"
                        : "Payment pending"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>
      );
    }

    // -----------------------------
    // ORDER DETAILS
    // -----------------------------

    if (customerPage === "order" && order) {
      const isServed = order.status === "Served";
      const hasPayment = Boolean(order.payment);
      const hasRating = Boolean(order.rating);
      const hasComplaint = Boolean(order.complaint);

      return (
        <main className="order-page">
          <div className="page-header-row">
            <div>
              <p className="eyebrow">Order Confirmation</p>

              <h2>Order #{order.order_id}</h2>

              <p className="section-subtitle">
                Here is everything you need to know about your order.
              </p>
            </div>

            <button
              className="secondary-button"
              onClick={() => {
                setCustomerPage("orders");
                loadCustomerOrders();
              }}
            >
              My Orders
            </button>
          </div>

          <section className="order-summary-card">
            <div className="order-status-header">
              <div>
                <span className="small-label">Order Status</span>

                <h3>{order.status}</h3>
              </div>

              <span
                className={`status-badge status-${String(
                  order.status,
                ).toLowerCase()}`}
              >
                {order.status}
              </span>
            </div>

            <div className="order-waiting-box">
              <span className="small-label">
                Estimated Waiting Time
              </span>

              <strong>
                {order.estimated_waiting_time} minutes
              </strong>
            </div>

            <div className="order-items-list">
              {order.items?.map((item) => (
                <div
                  className="order-item-row"
                  key={item.order_item_id}
                >
                  <div>
                    <strong>{item.name}</strong>

                    <span>
                      {item.quantity} × ₦
                      {Number(item.unit_price).toLocaleString()}
                    </span>
                  </div>

                  <strong>
                    ₦
                    {(
                      Number(item.unit_price) *
                      Number(item.quantity)
                    ).toLocaleString()}
                  </strong>
                </div>
              ))}
            </div>

            <div className="order-total-row">
              <span>Total</span>

              <strong>
                ₦{Number(order.total).toLocaleString()}
              </strong>
            </div>
          </section>

          <section className="assigned-staff-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Order Assignment</p>

                <h3>Restaurant Team</h3>
              </div>
            </div>

            {order.assignment ? (
              <div className="customer-staff-grid">
                <div className="staff-info-card">
                  <span>Waiter</span>

                  <strong>
                    {order.assignment.waiter_name || "Assigned"}
                  </strong>
                </div>

                <div className="staff-info-card">
                  <span>Chef</span>

                  <strong>
                    {order.assignment.chef_name || "Assigned"}
                  </strong>
                </div>

                <div className="staff-info-card">
                  <span>Bartender</span>

                  <strong>
                    {order.assignment.bartender_name || "Assigned"}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="empty-assignment">
                <p>
                  Staff have not been assigned to this order yet.
                </p>
              </div>
            )}
          </section>

          {/* SERVED ONLY: FEEDBACK */}
          {isServed && (
            <section className="feedback-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">After Service</p>

                  <h3>How was your experience?</h3>
                </div>
              </div>

              {hasRating && (
                <div className="saved-feedback">
                  <span className="small-label">
                    Your Rating
                  </span>

                  <strong>
                    {"★".repeat(Number(order.rating.rating))}
                    {"☆".repeat(
                      5 - Number(order.rating.rating),
                    )}
                  </strong>
                </div>
              )}

              {hasComplaint && (
                <div className="saved-feedback">
                  <span className="small-label">
                    Your Complaint
                  </span>

                  <p>
                    {order.complaint.complaint_text}
                  </p>
                </div>
              )}

              {!hasRating || !hasComplaint ? (
                <div className="feedback-form">
                  {!hasRating && (
                    <div className="rating-selector">
                      <label>Rating</label>

                      <div className="rating-buttons">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={
                              ratingValue >= value
                                ? "rating-button selected"
                                : "rating-button"
                            }
                            onClick={() =>
                              setRatingValue(value)
                            }
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!hasComplaint && (
                    <div className="form-group">
                      <label htmlFor="complaint">
                        Complaint or feedback
                      </label>

                      <textarea
                        id="complaint"
                        value={complaintText}
                        onChange={(event) =>
                          setComplaintText(event.target.value)
                        }
                        placeholder="Tell us about your experience..."
                        rows="4"
                      />
                    </div>
                  )}

                  <button
                    className="primary-button"
                    onClick={submitFeedback}
                    disabled={submittingFeedback}
                  >
                    {submittingFeedback
                      ? "Saving..."
                      : "Submit Feedback"}
                  </button>

                  {feedbackMessage && (
                    <p className="feedback-message">
                      {feedbackMessage}
                    </p>
                  )}
                </div>
              ) : (
                <p className="success-message">
                  Your feedback has been recorded.
                </p>
              )}
            </section>
          )}

          {/* SERVED ONLY: PAYMENT */}
          {isServed && (
            <section className="payment-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Checkout</p>

                  <h3>Payment</h3>
                </div>
              </div>

              <div className="pretend-payment-notice">
                <strong>PRETEND PAYMENT</strong>

                <span>
                  This button records a simulated payment for the
                  assignment. No real money will be charged.
                </span>
              </div>

              {hasPayment ? (
                <div className="paid-state">
                  <strong>✓ Paid</strong>

                  <span>
                    ₦
                    {Number(
                      order.payment.amount,
                    ).toLocaleString()}{" "}
                    via {order.payment.payment_method}
                  </span>
                </div>
              ) : (
                <button
                  className="primary-button payment-button"
                  onClick={payForOrder}
                  disabled={payingOrder}
                >
                  {payingOrder
                    ? "Recording Payment..."
                    : `Pretend Pay ₦${Number(
                        order.total,
                      ).toLocaleString()}`}
                </button>
              )}
            </section>
          )}

          {!isServed && (
            <section className="waiting-notice">
              <strong>Order in progress</strong>

              <p>
                Complaint, rating, and payment will become available
                once your order has been served.
              </p>
            </section>
          )}

          <button
            className="back-to-menu-button"
            onClick={backToMenu}
          >
            ← Back to Menu
          </button>
        </main>
      );
    }

    // -----------------------------
    // MENU + REVIEW
    // -----------------------------

    return (
      <main>
        <section className="hero-section">
          <div>
            <p className="eyebrow">Welcome to</p>

            <h2>{restaurant?.name || "Chowly"}</h2>

            <p className="hero-description">
              Browse our menu, place your order, and track your dining
              experience from one simple platform.
            </p>
          </div>

          <div className="hero-actions">
            <button
              className="my-orders-button"
              onClick={openCustomerOrders}
            >
              My Orders
            </button>
          </div>
        </section>

        {!showReview ? (
          <>
            <section className="menu-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Our Menu</p>

                  <h3>Food & Drinks</h3>
                </div>
              </div>

              <div className="menu-grid">
                {menu.map((item) => {
                  const cartItem = cart.find(
                    (cartEntry) =>
                      cartEntry.menu_item_id === item.menu_item_id,
                  );

                  return (
                    <article
                      className="menu-item-card"
                      key={item.menu_item_id}
                    >
                      <div className="food-visual">
                        <img
                          src={`/images/${
                            {
                              "Jollof Rice & Chicken":
                                "jollof-rice-chicken.jpg",
                              "Grilled Fish & Chips":
                                "grilled-fish-chips.jpg",
                              "Chicken Burger":
                                "chicken-burger.jpg",
                              "French Fries":
                                "french-fries.jpg",
                              "Fresh Orange Juice":
                                "fresh-orange-juice.jpg",
                              Chapman: "chapman.jpg",
                              "Bottled Water":
                                "bottled-water.jpg",
                            }[item.name]
                          }`}
                          alt={item.name}
                        />
                      </div>

                      <div className="menu-item-content">
                        <div className="menu-item-heading">
                          <div>
                            <span className="item-type">
                              {item.item_type}
                            </span>

                            <h4>{item.name}</h4>
                          </div>

                          <strong>
                            ₦{Number(item.price).toLocaleString()}
                          </strong>
                        </div>

                        <p className="prep-time">
                          Ready in approximately{" "}
                          {item.preparation_time} min
                        </p>

                        <div className="menu-card-actions">
                          {cartItem ? (
                            <div className="quantity-control">
                              <button
                                onClick={() =>
                                  removeFromCart(item.menu_item_id)
                                }
                              >
                                −
                              </button>

                              <span>{cartItem.quantity}</span>

                              <button
                                onClick={() =>
                                  addToCart(item)
                                }
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              className="add-button"
                              onClick={() => addToCart(item)}
                            >
                              Add to Order
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {cart.length > 0 && (
              <section className="cart-bar">
                <div>
                  <span>
                    {cart.reduce(
                      (total, item) => total + item.quantity,
                      0,
                    )}{" "}
                    item(s)
                  </span>

                  <strong>
                    ₦{cartTotal.toLocaleString()}
                  </strong>

                  <small>
                    Estimated preparation: {cartWaitingTime} min
                  </small>
                </div>

                <button
                  className="primary-button"
                  onClick={openReview}
                >
                  Review Order →
                </button>
              </section>
            )}
          </>
        ) : (
          <section className="review-section">
            <div className="page-header-row">
              <div>
                <p className="eyebrow">Almost There</p>

                <h2>Review Your Order</h2>

                <p className="section-subtitle">
                  Enter your details before submitting your order.
                </p>
              </div>

              <button
                className="secondary-button"
                onClick={() => setShowReview(false)}
              >
                Back to Menu
              </button>
            </div>

            <div className="review-layout">
              <div className="review-form-card">
                <h3>Customer Details</h3>

                <div className="form-group">
                  <label htmlFor="customerName">
                    Full Name *
                  </label>

                  <input
                    id="customerName"
                    type="text"
                    value={customerName}
                    onChange={(event) =>
                      setCustomerName(event.target.value)
                    }
                    placeholder="Enter your name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="customerPhone">
                    Phone Number *
                  </label>

                  <input
                    id="customerPhone"
                    type="tel"
                    value={customerPhone}
                    onChange={(event) =>
                      setCustomerPhone(event.target.value)
                    }
                    placeholder="e.g. +2348012345678"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="customerEmail">
                    Email Address
                  </label>

                  <input
                    id="customerEmail"
                    type="email"
                    value={customerEmail}
                    onChange={(event) =>
                      setCustomerEmail(event.target.value)
                    }
                    placeholder="Optional"
                  />
                </div>

                <button
                  className="primary-button place-order-button"
                  onClick={placeOrder}
                  disabled={placingOrder}
                >
                  {placingOrder ? "Placing Order..." : "Place Order"}
                </button>
              </div>

              <div className="review-order-card">
                <h3>Your Order</h3>

                <div className="review-items">
                  {cart.map((item) => (
                    <div
                      className="review-item"
                      key={item.menu_item_id}
                    >
                      <div>
                        <strong>{item.name}</strong>

                        <span>
                          {item.quantity} × ₦
                          {Number(item.price).toLocaleString()}
                        </span>
                      </div>

                      <strong>
                        ₦
                        {(
                          Number(item.price) * item.quantity
                        ).toLocaleString()}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="review-total">
                  <span>Total</span>

                  <strong>
                    ₦{cartTotal.toLocaleString()}
                  </strong>
                </div>

                <div className="review-wait">
                  Estimated preparation time:{" "}
                  <strong>{cartWaitingTime} minutes</strong>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    );
  };

  // --------------------------------------------------
  // WAITER MODE
  // --------------------------------------------------

  const renderWaiter = () => (
    <main className="waiter-page">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">Staff Mode</p>

          <h2>Waiter Dashboard</h2>

          <p className="section-subtitle">
            Manage orders, assign restaurant staff, and mark orders as
            served.
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={loadWaiterData}
        >
          Refresh Orders
        </button>
      </div>

      {waiterError && (
        <div className="error-card">
          <p>{waiterError}</p>
        </div>
      )}

      <div className="waiter-layout">
        <section className="orders-list-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Live Orders</p>

              <h3>All Orders</h3>
            </div>
          </div>

          {waiterLoading ? (
            <div className="empty-state">
              <p>Loading orders...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="empty-state">
              <h3>No orders</h3>

              <p>New customer orders will appear here.</p>
            </div>
          ) : (
            <div className="waiter-orders-list">
              {orders.map((currentOrder) => (
                <button
                  key={currentOrder.order_id}
                  className={
                    selectedOrder?.order_id === currentOrder.order_id
                      ? "waiter-order-card active"
                      : "waiter-order-card"
                  }
                  onClick={() =>
                    openOrder(currentOrder.order_id)
                  }
                >
                  <div className="waiter-order-top">
                    <div>
                      <strong>
                        Order #{currentOrder.order_id}
                      </strong>

                      <span className="customer-name-on-order">
                        {currentOrder.customer_name || "Customer"}
                      </span>
                    </div>

                    <span
                      className={`status-badge status-${String(
                        currentOrder.status,
                      ).toLowerCase()}`}
                    >
                      {currentOrder.status}
                    </span>
                  </div>

                  <div className="waiter-order-bottom">
                    <span>
                      {currentOrder.estimated_waiting_time} min
                    </span>

                    <span>
                      {currentOrder.payment_status === "Paid"
                        ? "Paid"
                        : "Unpaid"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="waiter-detail-section">
          {!selectedOrder ? (
            <div className="empty-state waiter-empty">
              <div className="empty-state-icon">☰</div>

              <h3>Select an order</h3>

              <p>
                Choose an order from the list to view its details and
                manage staff assignment.
              </p>
            </div>
          ) : (
            <div className="waiter-order-detail">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">
                    Order #{selectedOrder.order_id}
                  </p>

                  <h3>
                    {selectedOrder.customer_name || "Customer"}
                  </h3>
                </div>

                <span
                  className={`status-badge status-${String(
                    selectedOrder.status,
                  ).toLowerCase()}`}
                >
                  {selectedOrder.status}
                </span>
              </div>

              <div className="customer-contact">
                {selectedOrder.customer_phone && (
                  <span>
                    📞 {selectedOrder.customer_phone}
                  </span>
                )}

                {selectedOrder.customer_email && (
                  <span>
                    ✉️ {selectedOrder.customer_email}
                  </span>
                )}
              </div>

              <div className="waiter-detail-items">
                {selectedOrder.items?.map((item) => (
                  <div
                    className="order-item-row"
                    key={item.order_item_id}
                  >
                    <div>
                      <strong>{item.name}</strong>

                      <span>
                        Quantity: {item.quantity}
                      </span>
                    </div>

                    <span>
                      {item.preparation_role
                        ? `${item.preparation_role} assigned`
                        : selectedOrder.status === "Served"
                          ? "Prepared"
                          : "Awaiting preparation"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="detail-total">
                <span>Total</span>

                <strong>
                  ₦
                  {Number(
                    selectedOrder.total,
                  ).toLocaleString()}
                </strong>
              </div>

              {/* STAFF ASSIGNMENT */}
              <section className="staff-assignment-section">
                <div className="assignment-header">
                  <div>
                    <p className="eyebrow">
                      Staff Assignment
                    </p>

                    <h4>Restaurant Team</h4>
                  </div>

                  {selectedOrder.assignment &&
                    !reassigningStaff && (
                      <button
                        className="secondary-button"
                        onClick={() =>
                          setReassigningStaff(true)
                        }
                      >
                        Reassign Staff
                      </button>
                    )}
                </div>

                {selectedOrder.assignment &&
                !reassigningStaff ? (
                  <div className="assigned-staff-summary">
                    <div>
                      <span>Waiter</span>

                      <strong>
                        {selectedOrder.assignment.waiter_name}
                      </strong>
                    </div>

                    <div>
                      <span>Chef</span>

                      <strong>
                        {selectedOrder.assignment.chef_name}
                      </strong>
                    </div>

                    <div>
                      <span>Bartender</span>

                      <strong>
                        {selectedOrder.assignment.bartender_name}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <div className="staff-assignment-form">
                    <div className="form-group">
                      <label htmlFor="waiterSelect">
                        Waiter
                      </label>

                      <select
                        id="waiterSelect"
                        value={selectedStaff.waiter_id}
                        onChange={(event) =>
                          setSelectedStaff({
                            ...selectedStaff,
                            waiter_id: event.target.value,
                          })
                        }
                      >
                        <option value="">
                          Select waiter
                        </option>

                        {getStaffByRole("Waiter").map(
                          (person) => (
                            <option
                              key={person.staff_id}
                              value={person.staff_id}
                            >
                              {person.name}
                            </option>
                          ),
                        )}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="chefSelect">
                        Chef
                      </label>

                      <select
                        id="chefSelect"
                        value={selectedStaff.chef_id}
                        onChange={(event) =>
                          setSelectedStaff({
                            ...selectedStaff,
                            chef_id: event.target.value,
                          })
                        }
                      >
                        <option value="">
                          Select chef
                        </option>

                        {getStaffByRole("Chef").map(
                          (person) => (
                            <option
                              key={person.staff_id}
                              value={person.staff_id}
                            >
                              {person.name}
                            </option>
                          ),
                        )}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="bartenderSelect">
                        Bartender
                      </label>

                      <select
                        id="bartenderSelect"
                        value={selectedStaff.bartender_id}
                        onChange={(event) =>
                          setSelectedStaff({
                            ...selectedStaff,
                            bartender_id: event.target.value,
                          })
                        }
                      >
                        <option value="">
                          Select bartender
                        </option>

                        {getStaffByRole("Bartender").map(
                          (person) => (
                            <option
                              key={person.staff_id}
                              value={person.staff_id}
                            >
                              {person.name}
                            </option>
                          ),
                        )}
                      </select>
                    </div>

                    <div className="assignment-actions">
                      <button
                        className="primary-button"
                        onClick={assignStaff}
                      >
                        {selectedOrder.assignment
                          ? "Save Reassignment"
                          : "Assign Staff"}
                      </button>

                      {selectedOrder.assignment && (
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setReassigningStaff(false);

                            setSelectedStaff({
                              waiter_id: String(
                                selectedOrder.assignment
                                  .waiter_id,
                              ),
                              chef_id: String(
                                selectedOrder.assignment
                                  .chef_id,
                              ),
                              bartender_id: String(
                                selectedOrder.assignment
                                  .bartender_id,
                              ),
                            });
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* ORDER ACTIONS */}
              <div className="order-actions">
                <button
                  className="danger-button"
                  onClick={deleteOrder}
                >
                  Delete Order
                </button>

                {selectedOrder.status !== "Served" && (
                  <button
                    className="serve-button"
                    onClick={markServed}
                  >
                    ✓ Mark Order as Served
                  </button>
                )}
              </div>

              {selectedOrder.status === "Served" && (
                <div className="served-confirmation">
                  <strong>✓ Order Served</strong>

                  <span>
                    This order has been marked as served.
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );

  // --------------------------------------------------
  // APP SHELL
  // --------------------------------------------------

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">C</div>

          <div>
            <h1>Chowly</h1>

            <span>Restaurant Ordering Platform</span>
          </div>
        </div>

        <div className="mode-switcher">
          <button
            className={
              mode === "customer"
                ? "mode-button active"
                : "mode-button"
            }
            onClick={() => switchMode("customer")}
          >
            Customer
          </button>

          <button
            className={
              mode === "waiter"
                ? "mode-button active"
                : "mode-button"
            }
            onClick={() => switchMode("waiter")}
          >
            Waiter
          </button>
        </div>
      </header>

      <div className="app-content">
        {mode === "customer"
          ? renderCustomer()
          : renderWaiter()}
      </div>

      <footer className="footer">
        <span>Chowly</span>

        <span>
          Restaurant Ordering & Dining Management
        </span>
      </footer>
    </div>
  );
}

export default App;