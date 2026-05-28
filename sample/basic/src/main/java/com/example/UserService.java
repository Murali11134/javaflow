package com.example;

/** Service layer used to demonstrate JavaFlow class and method relationships. */
public class UserService {
  private final UserRepository repository;

  public UserService(UserRepository repository) {
    this.repository = repository;
  }

  public User register(String id, String name) {
    User user = new User(id, name);
    repository.save(user);
    return user;
  }

  public User load(String id) {
    return repository.findById(id);
  }
}
