import * as assert from 'assert';
import { parseJavaFile } from '../parser/javaParser';
import { generateClassMindmap, generateFolderMindmap, MindmapOptions } from '../mindmap/mindmapGenerator';

type TestCase = {
  name: string;
  run: () => void;
};

const sampleJava = `
package com.example.demo;

import java.util.List;
import java.util.Map;

/**
 * Handles user data for the application.
 */
public class UserService extends BaseService implements Runnable, AutoCloseable {
  /** Active users in memory. */
  public static final List<String> users = List.of();

  private int retryCount;

  /**
   * Gets the user name.
   */
  public String getUserName(String id) {
    validate(id);
    return loadName(id);
  }

  protected void validate(String id) {
    System.out.println(id);
  }
}
`;

const options: MindmapOptions = {
  showPrivateMembers: false,
  nlpSummaries: true,
  maxDepth: 3
};

const tests: TestCase[] = [
  {
    name: 'parseJavaFile extracts class metadata',
    run: () => {
      const classes = parseJavaFile(sampleJava, 'UserService.java');
      assert.strictEqual(classes.length, 1);

      const cls = classes[0];
      assert.strictEqual(cls.name, 'UserService');
      assert.strictEqual(cls.kind, 'class');
      assert.strictEqual(cls.packageName, 'com.example.demo');
      assert.strictEqual(cls.superClass, 'BaseService');
      assert.deepStrictEqual(cls.interfaces, ['Runnable', 'AutoCloseable']);
      assert.deepStrictEqual(cls.imports, ['java.util.List', 'java.util.Map']);
      assert.strictEqual(cls.javadoc, 'Handles user data for the application.');
    }
  },
  {
    name: 'parseJavaFile extracts fields and methods',
    run: () => {
      const [cls] = parseJavaFile(sampleJava, 'UserService.java');

      assert.strictEqual(cls.fields.length, 2);
      assert.deepStrictEqual(
        cls.fields.map(field => field.name),
        ['users', 'retryCount']
      );

      const usersField = cls.fields.find(field => field.name === 'users');
      assert.ok(usersField);
      assert.strictEqual(usersField.type, 'List<String>');
      assert.strictEqual(usersField.visibility, 'public');
      assert.strictEqual(usersField.isStatic, true);
      assert.strictEqual(usersField.isFinal, true);

      const method = cls.methods.find(m => m.name === 'getUserName');
      assert.ok(method);
      assert.strictEqual(method.returnType, 'String');
      assert.strictEqual(method.visibility, 'public');
      assert.deepStrictEqual(method.parameters, [{ name: 'id', type: 'String' }]);
      assert.deepStrictEqual(method.callsTo, ['validate', 'loadName']);
      assert.strictEqual(method.javadoc, 'Gets the user name.');
    }
  },
  {
    name: 'generateClassMindmap hides private members by default',
    run: () => {
      const [cls] = parseJavaFile(sampleJava, 'UserService.java');
      const markdown = generateClassMindmap(cls, options);

      assert.ok(markdown.includes('UserService'));
      assert.ok(markdown.includes('com.example.demo'));
      assert.ok(markdown.includes('Handles user data for the application.'));
      assert.ok(markdown.includes('users : List<String>'));
      assert.ok(markdown.includes('getUserName(id: String) : String'));
      assert.ok(markdown.includes('validate()'));
      assert.ok(markdown.includes('loadName()'));
      assert.ok(!markdown.includes('retryCount'));
    }
  },
  {
    name: 'generateFolderMindmap groups classes by package',
    run: () => {
      const classes = parseJavaFile(sampleJava, 'UserService.java');
      const markdown = generateFolderMindmap(classes, options, 'demo-project');

      assert.ok(markdown.startsWith('#'));
      assert.ok(markdown.includes('demo-project'));
      assert.ok(markdown.includes('com.example.demo'));
      assert.ok(markdown.includes('UserService'));
      assert.ok(markdown.includes('Methods (1)'));
      assert.ok(markdown.includes('getUserName(String)'));
    }
  }
];

function runTests(): void {
  let passed = 0;

  for (const test of tests) {
    test.run();
    passed++;
    console.log(`PASS ${test.name}`);
  }

  console.log(`\n${passed} tests passed.`);
}

runTests();
