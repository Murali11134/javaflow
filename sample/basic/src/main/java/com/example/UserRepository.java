package com.example;

import java.util.HashMap;
import java.util.Map;

/** In-memory repository used by the JavaFlow sample project. */
public class UserRepository {
  private final Map<String, User> users = new HashMap<>();

  public void save(User user) {
    users.put(user.getId(), user);
  }

  public User findById(String id) {
    return users.get(id);
  }
}
