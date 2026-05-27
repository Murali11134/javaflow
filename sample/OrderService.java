package com.example.shop;

import java.util.List;
import java.util.Optional;

/**
 * Manages customer orders from creation through fulfilment.
 */
@Service
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final InventoryService inventoryService;
    private boolean auditEnabled;

    public OrderService(OrderRepository orderRepository, InventoryService inventoryService) {
        this.orderRepository = orderRepository;
        this.inventoryService = inventoryService;
        this.auditEnabled = true;
    }

    public Order createOrder(Customer customer, List<OrderItem> items) {
        validate(customer, items);
        Order order = Order.builder()
            .customer(customer)
            .items(items)
            .status(OrderStatus.PENDING)
            .build();
        return orderRepository.save(order);
    }

    public Optional<Order> findById(Long id) {
        return orderRepository.findById(id);
    }

    public Order updateStatus(Long orderId, OrderStatus newStatus) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));
        order.setStatus(newStatus);
        return orderRepository.save(order);
    }

    public void cancelOrder(Long orderId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (order.getStatus() == OrderStatus.SHIPPED) {
            throw new IllegalStateException("Cannot cancel a shipped order");
        }
        order.setStatus(OrderStatus.CANCELLED);
        inventoryService.restoreStock(order.getItems());
        orderRepository.save(order);
    }

    private void validate(Customer customer, List<OrderItem> items) {
        if (customer == null) throw new IllegalArgumentException("Customer required");
        if (items == null || items.isEmpty()) throw new IllegalArgumentException("Items required");
    }

    // ── Inner classes ──────────────────────────────────────────────────────────

    @Entity
    @Table(name = "orders")
    public static class Order {
        private Long id;
        private Customer customer;
        private List<OrderItem> items;
        private OrderStatus status;

        private Order() {}

        public Long getId() { return id; }
        public Customer getCustomer() { return customer; }
        public OrderStatus getStatus() { return status; }
        public void setStatus(OrderStatus status) { this.status = status; }
        public List<OrderItem> getItems() { return items; }

        public static Builder builder() { return new Builder(); }

        public static class Builder {
            private Customer customer;
            private List<OrderItem> items;
            private OrderStatus status;

            public Builder customer(Customer c) { this.customer = c; return this; }
            public Builder items(List<OrderItem> i) { this.items = i; return this; }
            public Builder status(OrderStatus s) { this.status = s; return this; }
            public Order build() {
                Order o = new Order();
                o.customer = this.customer;
                o.items = this.items;
                o.status = this.status;
                return o;
            }
        }
    }

    public enum OrderStatus {
        PENDING,
        CONFIRMED,
        PROCESSING,
        SHIPPED,
        DELIVERED,
        CANCELLED
    }

    public interface OrderRepository {
        Order save(Order order);
        Optional<Order> findById(Long id);
        List<Order> findByCustomer(Customer customer);
    }
}
