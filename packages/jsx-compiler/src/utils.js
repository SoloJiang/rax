const t = require('@babel/types');
const { RAX_PACKAGE, RAX_COMPONENT } = require('../constant');

/**
 * Judge a NodePath is a Rax JSX class declaration.
 * @param path {NodePath}
 * eg:
 *  1. class xxx extends *.Component {}
 *  2. class xxx extends Component {}
 */
function isJSXClassComponent(path) {
  const { node, scope } = path;
  let importModuleBinding;

  if (t.isMemberExpression(node.superClass)) {
    // Case 1
    // Step 1: judge property name is Component.
    if (!t.isIdentifier(node.superClass.property, { name: RAX_COMPONENT })) return false;

    // Step2: find `object` is import from 'rax'.
    importModuleBinding = scope.getBinding(node.superClass.object.name);
  } else if (t.isIdentifier(node.superClass)) {
    // Case 2
    importModuleBinding = scope.getBinding(node.superClass.name);
  }

  if (importModuleBinding && importModuleBinding.kind === 'module') {
    const bindingPath = importModuleBinding.path.parentPath;
    if (t.isImportDeclaration(bindingPath.node)) {
      return t.isStringLiteral(bindingPath.node.source, { value: RAX_PACKAGE });
    }
  }
  return false;
}

exports.isJSXClassComponent = isJSXClassComponent;


/**
 * Judge a NodePath is a Rax JSX function component.
 * @param path {NodePath}
 * eg:
 *  1. class xxx extends *.Component {}
 *  2. class xxx extends Component {}
 */
function isJSXFunctionComponent(path) {

}
